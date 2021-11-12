import { MarketBuySwapQuote, MarketSellSwapQuote } from '@0x/asset-swapper';
import { assetDataUtils } from '@0x/order-utils';
import { ERC20AssetData, SignedOrder } from '@0x/types';
import { BigNumber } from '@0x/utils';

import { LENDING_POOL_CORE_ADDRESS } from './aave/constants';
import { ATokenData, Protocol } from './aave/types';
import { isWeth, isZrx, isWhackd } from './known_tokens';
import {
    Collectible,
    iTokenData,
    OrderFeeData,
    OrderSide,
    Step,
    StepBuyCollectible,
    StepKind,
    StepToggleTokenLock,
    StepUnlockCollectibles,
    StepWrapEth,
    Token,
    TokenBalance,
} from './types';

export const createBuySellLimitSteps = (
    baseToken: Token,
    quoteToken: Token,
    tokenBalances: TokenBalance[],
    wethTokenBalance: TokenBalance,
    amount: BigNumber,
    price: BigNumber,
    side: OrderSide,
    orderFeeData: OrderFeeData,
    is_ieo?: boolean,
): Step[] => {
    const buySellLimitFlow: Step[] = [];
    let unlockTokenStep;

    // unlock base and quote tokens if necessary

    unlockTokenStep =
        side === OrderSide.Buy
            ? // If it's a buy -> the quote token has to be unlocked
              getUnlockTokenStepIfNeeded(quoteToken, tokenBalances, wethTokenBalance)
            : // If it's a sell -> the base token has to be unlocked
              getUnlockTokenStepIfNeeded(baseToken, tokenBalances, wethTokenBalance);

    if (unlockTokenStep) {
        buySellLimitFlow.push(unlockTokenStep);
    }

    if (orderFeeData.makerFee.isGreaterThan(0)) {
        const { tokenAddress } = assetDataUtils.decodeAssetDataOrThrow(
            orderFeeData.makerFeeAssetData,
        ) as ERC20AssetData;
        if (!unlockTokenStep || unlockTokenStep.token.address !== tokenAddress) {
            const unlockFeeTokenStep = getUnlockFeeAssetStepIfNeeded(
                [...tokenBalances, wethTokenBalance],
                tokenAddress,
            );
            if (unlockFeeTokenStep) {
                buySellLimitFlow.push(unlockFeeTokenStep);
            }
        }
    }

    // wrap the necessary ether if it is one of the traded tokens
    if (isWeth(baseToken.symbol) || isWeth(quoteToken.symbol)) {
        let feeBalance = new BigNumber(0);
        // check if maker fee data is Weth
        try {
            if (orderFeeData.makerFee.isGreaterThan(0)) {
                const { tokenAddress } = assetDataUtils.decodeAssetDataOrThrow(
                    orderFeeData.makerFeeAssetData,
                ) as ERC20AssetData;
                // check if needs to pay fee token
                if (wethTokenBalance.token.address.toLowerCase() === tokenAddress.toLowerCase()) {
                    feeBalance = orderFeeData.makerFee;
                }
            }
        } catch (e) {
            //
        }
        const isWethQuote = isWeth(quoteToken.symbol.toLowerCase()) ? true : false;
        const wrapEthStep = getWrapEthStepIfNeeded(
            amount,
            price,
            side,
            wethTokenBalance,
            undefined,
            feeBalance,
            isWethQuote,
        );
        if (wrapEthStep) {
            buySellLimitFlow.push(wrapEthStep);
        }
    }

    buySellLimitFlow.push({
        kind: StepKind.BuySellLimit,
        amount,
        price,
        side,
        token: baseToken,
        is_ieo,
    });

    return buySellLimitFlow;
};

export const createBuySellLimitMatchingSteps = (
    baseToken: Token,
    quoteToken: Token,
    tokenBalances: TokenBalance[],
    wethTokenBalance: TokenBalance,
    ethBalance: BigNumber,
    amount: BigNumber,
    side: OrderSide,
    price: BigNumber,
    price_avg: BigNumber,
    ordersToFill: SignedOrder[],
): Step[] => {
    const buySellLimitMatchingFlow: Step[] = [];
    const isBuy = side === OrderSide.Buy;
    const tokenToUnlock = isBuy ? quoteToken : baseToken;

    const unlockTokenStep = getUnlockTokenStepIfNeeded(tokenToUnlock, tokenBalances, wethTokenBalance);
    // Unlock token step should be added if it:
    // 1) it's a sell, or
    const isSell = unlockTokenStep && side === OrderSide.Sell;
    // 2) is a buy and
    // base token is not weth and is locked, or
    // base token is weth, is locked and there is not enouth plain ETH to fill the order
    const isBuyWithWethConditions =
        isBuy &&
        unlockTokenStep &&
        (!isWeth(tokenToUnlock.symbol) ||
            (isWeth(tokenToUnlock.symbol) && ethBalance.isLessThan(amount.multipliedBy(price))));
    if (isSell || isBuyWithWethConditions) {
        buySellLimitMatchingFlow.push(unlockTokenStep as Step);
    }
    const order = ordersToFill[0];
    if (order.takerFee.isGreaterThan(0)) {
        const { tokenAddress } = assetDataUtils.decodeAssetDataOrThrow(order.takerFeeAssetData) as ERC20AssetData;
        if (!unlockTokenStep || (unlockTokenStep && unlockTokenStep.token.address !== tokenAddress)) {
            const unlockFeeTokenStep = getUnlockFeeAssetStepIfNeeded(
                [...tokenBalances, wethTokenBalance],
                tokenAddress,
            );
            if (unlockFeeTokenStep) {
                buySellLimitMatchingFlow.push(unlockFeeTokenStep);
            }
        }
    }

    // wrap the necessary ether if necessary
    if (isWeth(quoteToken.symbol)) {
        const isWhackedBase = isWhackd(baseToken.symbol) ? true : false;
        const wrapEthStep = getWrapEthStepIfNeeded(
            amount,
            price,
            side,
            wethTokenBalance,
            ethBalance,
            undefined,
            true,
            isWhackedBase,
        );
        if (wrapEthStep) {
            buySellLimitMatchingFlow.push(wrapEthStep);
        }
    }

    buySellLimitMatchingFlow.push({
        kind: StepKind.BuySellLimitMatching,
        amount,
        side,
        price,
        price_avg,
        token: baseToken,
    });
    return buySellLimitMatchingFlow;
};

export const createSellCollectibleSteps = (
    collectible: Collectible,
    startPrice: BigNumber,
    side: OrderSide,
    isUnlocked: boolean,
    expirationDate: BigNumber,
    endPrice: BigNumber | null,
): Step[] => {
    const sellCollectibleFlow: Step[] = [];

    // Unlock collectible
    if (!isUnlocked) {
        const unlockCollectibleStep = getUnlockCollectibleStep(collectible);
        sellCollectibleFlow.push(unlockCollectibleStep);
    }

    // Sign order step
    sellCollectibleFlow.push({
        kind: StepKind.SellCollectible,
        collectible,
        startPrice,
        endPrice,
        expirationDate,
        side,
    });

    return sellCollectibleFlow;
};

export const createBasicBuyCollectibleSteps = (order: SignedOrder, collectible: Collectible): Step[] => {
    return [getBuyCollectibleStep(order, collectible)];
};

export const createDutchBuyCollectibleSteps = (
    order: SignedOrder,
    collectible: Collectible,
    wethTokenBalance: TokenBalance,
    priceInWeth: BigNumber,
): Step[] => {
    const steps: Step[] = [];

    // wrap ether
    const wethBalance = wethTokenBalance.balance;
    const deltaWeth = wethBalance.minus(priceInWeth);
    if (deltaWeth.isLessThan(0)) {
        steps.push({
            kind: StepKind.WrapEth,
            currentWethBalance: wethBalance,
            newWethBalance: priceInWeth,
            context: 'order',
        });
    }

    // unlock weth
    if (!wethTokenBalance.isUnlocked) {
        const unlockWethStep: StepToggleTokenLock = {
            kind: StepKind.ToggleTokenLock,
            token: wethTokenBalance.token,
            context: 'order',
            isUnlocked: false,
        };
        steps.push(unlockWethStep);
    }

    // buy collectible
    steps.push(getBuyCollectibleStep(order, collectible));

    return steps;
};

export const createBuySellMarketSteps = (
    baseToken: Token,
    quoteToken: Token,
    tokenBalances: TokenBalance[],
    wethTokenBalance: TokenBalance,
    ethBalance: BigNumber,
    amount: BigNumber,
    side: OrderSide,
    price: BigNumber,
    ordersToFill: SignedOrder[],
): Step[] => {
    const buySellMarketFlow: Step[] = [];
    const isBuy = side === OrderSide.Buy;
    const tokenToUnlock = isBuy ? quoteToken : baseToken;

    const unlockTokenStep = getUnlockTokenStepIfNeeded(tokenToUnlock, tokenBalances, wethTokenBalance);
    // Unlock token step should be added if it:
    // 1) it's a sell, or
    const isSell = unlockTokenStep && side === OrderSide.Sell;
    // 2) is a buy and
    // base token is not weth and is locked, or
    // base token is weth, is locked and there is not enouth plain ETH to fill the order
    const isBuyWithWethConditions =
        isBuy &&
        unlockTokenStep &&
        (!isWeth(tokenToUnlock.symbol) ||
            (isWeth(tokenToUnlock.symbol) && ethBalance.isLessThan(amount.multipliedBy(price))));
    if (isSell || isBuyWithWethConditions) {
        buySellMarketFlow.push(unlockTokenStep as Step);
    }
    // Note: We assume that fees are constructed the same way on the other orders
    const order = ordersToFill[0];
    // unlock fees if the taker fee is positive
    if (order.takerFee.isGreaterThan(0)) {
        const { tokenAddress } = assetDataUtils.decodeAssetDataOrThrow(order.takerFeeAssetData) as ERC20AssetData;
        if (!unlockTokenStep || (unlockTokenStep && unlockTokenStep.token.address !== tokenAddress)) {
            const unlockFeeStep = getUnlockFeeAssetStepIfNeeded([...tokenBalances, wethTokenBalance], tokenAddress);
            if (unlockFeeStep) {
                buySellMarketFlow.push(unlockFeeStep);
            }
        }
    }

    // wrap the necessary ether if necessary
    if (isWeth(quoteToken.symbol)) {
        const isWhackedBase = isWhackd(baseToken.symbol) ? true : false;
        const wrapEthStep = getWrapEthStepIfNeeded(
            amount,
            price,
            side,
            wethTokenBalance,
            ethBalance,
            undefined,
            true,
            isWhackedBase,
        );
        if (wrapEthStep) {
            buySellMarketFlow.push(wrapEthStep);
        }
    }

    buySellMarketFlow.push({
        kind: StepKind.BuySellMarket,
        amount,
        side,
        token: baseToken,
        context: 'order',
    });
    return buySellMarketFlow;
};

export const createSwapMarketSteps = (
    baseToken: Token,
    quoteToken: Token,
    tokenBalances: TokenBalance[],
    wethTokenBalance: TokenBalance,
    ethBalance: BigNumber,
    amount: BigNumber,
    side: OrderSide,
    price: BigNumber,
    quote: MarketBuySwapQuote | MarketSellSwapQuote,
): Step[] => {
    const buySellMarketFlow: Step[] = [];
    const isBuy = side === OrderSide.Buy;
    const tokenToUnlock = isBuy ? quoteToken : baseToken;

    const unlockTokenStep = getUnlockTokenStepIfNeeded(tokenToUnlock, tokenBalances, wethTokenBalance);
    // Unlock token step should be added if it:
    // 1) it's a sell, or
    // We are assuming only buys with ETH at the moment
    const isSell = unlockTokenStep && side === OrderSide.Sell && !isWeth(tokenToUnlock.symbol);
    // 2) is a buy and
    // base token is not weth and is locked, or
    // base token is weth, is locked and there is not enouth plain ETH to fill the order
    const isBuyWithWethConditions =
        isBuy &&
        unlockTokenStep &&
        (!isWeth(tokenToUnlock.symbol) ||
            (isWeth(tokenToUnlock.symbol) && ethBalance.isLessThan(quote.bestCaseQuoteInfo.takerAssetAmount)));
    if (isSell || isBuyWithWethConditions) {
        buySellMarketFlow.push(unlockTokenStep as Step);
    }

    // unlock fees if the taker fee is positive
    if (quote.bestCaseQuoteInfo.feeTakerAssetAmount.isGreaterThan(0)) {
        const { tokenAddress } = assetDataUtils.decodeAssetDataOrThrow(quote.takerAssetData) as ERC20AssetData;
        if (!unlockTokenStep || (unlockTokenStep && unlockTokenStep.token.address !== tokenAddress)) {
            const unlockFeeStep = getUnlockFeeAssetStepIfNeeded([...tokenBalances, wethTokenBalance], tokenAddress);
            if (unlockFeeStep) {
                buySellMarketFlow.push(unlockFeeStep);
            }
        }
    }

    // wrap the necessary ether if necessary
    if (isWeth(quoteToken.symbol) || isWeth(baseToken.symbol)) {
        const isWethQuote = isWeth(quoteToken.symbol) ? true : false;
        const isWhackedQuote = isWhackd(quoteToken.symbol) ? true : false;
        const wrapEthStep = getWrapEthStepIfNeeded(
            amount,
            price,
            side,
            wethTokenBalance,
            ethBalance,
            undefined,
            isWethQuote,
            isWhackedQuote,
        );
        if (wrapEthStep) {
            buySellMarketFlow.push(wrapEthStep);
        }
    }

    buySellMarketFlow.push({
        kind: StepKind.BuySellMarket,
        amount,
        side,
        token: baseToken,
        context: 'swap',
        quote,
    });

    return buySellMarketFlow;
};

export const createLendingTokenSteps = (
    defiToken: iTokenData | ATokenData,
    token: Token,
    // tokenBalances: TokenBalance[],
    wethTokenBalance: BigNumber,
    ethBalance: BigNumber,
    amount: BigNumber,
    isEth: boolean,
    protocol: Protocol,
): Step[] => {
    const lendingTokenFlow: Step[] = [];
    if (isEth) {
        if (amount.isGreaterThan(ethBalance)) {
            const newWethBalance = wethTokenBalance.minus(amount.minus(ethBalance));
            const currentWethBalance = wethTokenBalance;
            const wrapEthStep: StepWrapEth = {
                kind: StepKind.WrapEth,
                currentWethBalance,
                newWethBalance,
                context: 'standalone',
            };
            lendingTokenFlow.push(wrapEthStep);
            // unwrapp eth here
        }
    } else {
        const unlockTokenStep = getUnlockLendingTokenStepIfNeeded(defiToken, token, protocol);
        if (unlockTokenStep) {
            lendingTokenFlow.push(unlockTokenStep);
        }
    }

    lendingTokenFlow.push({
        kind: StepKind.LendingToken,
        amount,
        token,
        defiToken,
        isEth,
        isLending: true,
    });
    return lendingTokenFlow;
};

export const createBorrowTokenSteps = (
    defiToken: iTokenData | ATokenData,
    token: Token,
    // tokenBalances: TokenBalance[],
    wethTokenBalance: BigNumber,
    ethBalance: BigNumber,
    amount: BigNumber,
    isEth: boolean,
    protocol: Protocol,
): Step[] => {
    const borrowTokenFlow: Step[] = [];
    if (isEth) {
        if (amount.isGreaterThan(ethBalance)) {
            const newWethBalance = wethTokenBalance.minus(amount.minus(ethBalance));
            const currentWethBalance = wethTokenBalance;
            const wrapEthStep: StepWrapEth = {
                kind: StepKind.WrapEth,
                currentWethBalance,
                newWethBalance,
                context: 'standalone',
            };
            borrowTokenFlow.push(wrapEthStep);
            // unwrapp eth here
        }
    } else {
        /* const unlockTokenStep = getUnlockLendingTokenStepIfNeeded(defiToken, token, protocol);
        if (unlockTokenStep) {
            borrowTokenFlow.push(unlockTokenStep);
        }*/
    }
    const isBorrow = true;

    borrowTokenFlow.push({
        kind: StepKind.BorrowToken,
        amount,
        token,
        defiToken,
        isEth,
        isBorrow,
    });
    return borrowTokenFlow;
};

export const createRepayTokenSteps = (
    defiToken: iTokenData | ATokenData,
    token: Token,
    // tokenBalances: TokenBalance[],
    wethTokenBalance: BigNumber,
    ethBalance: BigNumber,
    amount: BigNumber,
    isEth: boolean,
    protocol: Protocol,
): Step[] => {
    const repayTokenFlow: Step[] = [];
    if (isEth) {
        if (amount.isGreaterThan(ethBalance)) {
            const newWethBalance = wethTokenBalance.minus(amount.minus(ethBalance));
            const currentWethBalance = wethTokenBalance;
            const wrapEthStep: StepWrapEth = {
                kind: StepKind.WrapEth,
                currentWethBalance,
                newWethBalance,
                context: 'standalone',
            };
            repayTokenFlow.push(wrapEthStep);
            // unwrapp eth here
        }
    } else {
        const unlockTokenStep = getUnlockLendingTokenStepIfNeeded(defiToken, token, protocol);
        if (unlockTokenStep) {
            repayTokenFlow.push(unlockTokenStep);
        }
    }
    const isBorrow = false;

    repayTokenFlow.push({
        kind: StepKind.RepayToken,
        amount,
        token,
        defiToken,
        isEth,
        isBorrow,
    });
    return repayTokenFlow;
};

export const getUnlockLendingTokenStepIfNeeded = (
    defiToken: iTokenData | ATokenData,
    token: Token,
    protocol: Protocol,
): StepToggleTokenLock | null => {
    let address;
    switch (protocol) {
        case Protocol.Aave:
            address = LENDING_POOL_CORE_ADDRESS;
            break;
        case Protocol.Bzx:
            address = defiToken.address;
            break;
        default:
            break;
    }

    if (defiToken.isUnlocked) {
        return null;
    } else {
        return {
            kind: StepKind.ToggleTokenLock,
            token,
            address,
            isUnlocked: false,
            context: 'lending',
        };
    }
};

export const getUnlockTokenStepIfNeeded = (
    token: Token,
    tokenBalances: TokenBalance[],
    wethTokenBalance: TokenBalance,
): StepToggleTokenLock | null => {
    const tokenBalance: TokenBalance = isWeth(token.symbol)
        ? wethTokenBalance
        : (tokenBalances.find(tb => tb.token.symbol === token.symbol) as TokenBalance);
    if (tokenBalance.isUnlocked) {
        return null;
    } else {
        return {
            kind: StepKind.ToggleTokenLock,
            token: tokenBalance.token,
            isUnlocked: false,
            context: 'order',
        };
    }
};

export const getUnlockCollectibleStep = (collectible: Collectible): StepUnlockCollectibles => {
    return {
        kind: StepKind.UnlockCollectibles,
        collectible,
        isUnlocked: false,
    };
};

export const getBuyCollectibleStep = (order: SignedOrder, collectible: Collectible): StepBuyCollectible => {
    return {
        kind: StepKind.BuyCollectible,
        order,
        collectible,
    };
};

export const getWrapEthStepIfNeeded = (
    amount: BigNumber,
    price: BigNumber,
    side: OrderSide,
    wethTokenBalance: TokenBalance,
    ethBalance?: BigNumber,
    feeBalance?: BigNumber,
    isQuote: boolean = true,
    // Note: some tokens not work with forwarder, force wrap for these cases. TODO: Remove this workaraound
    forceWrap: boolean = false,
): StepWrapEth | null => {
    // Weth needed only when creating a buy order
    if (side === OrderSide.Sell && isQuote) {
        return null;
    }
    // Weth needed when creating a sell order and it is not a quote
    if (side === OrderSide.Buy && !isQuote) {
        return null;
    }

    let wethAmountNeeded = isQuote ? amount.multipliedBy(price) : amount;
    if (feeBalance) {
        wethAmountNeeded = wethAmountNeeded.plus(feeBalance);
    }

    // If we have enough WETH, we don't need to wrap
    if (wethTokenBalance.balance.isGreaterThan(wethAmountNeeded)) {
        return null;
    }

    // Weth needed only if not enough plain ETH to use forwarder
    if (ethBalance && ethBalance.isGreaterThan(wethAmountNeeded) && !forceWrap) {
        return null;
    }

    const wethBalance = wethTokenBalance.balance;
    const deltaWeth = wethBalance.minus(wethAmountNeeded);
    // Need to wrap eth only if weth balance is not enough
    if (deltaWeth.isLessThan(0)) {
        return {
            kind: StepKind.WrapEth,
            currentWethBalance: wethBalance,
            newWethBalance: wethAmountNeeded,
            context: 'order',
        };
    } else {
        return null;
    }
};

export const getUnlockFeeAssetStepIfNeeded = (
    tokenBalances: TokenBalance[],
    feeTokenAddress: string,
): StepToggleTokenLock | null => {
    const balance = tokenBalances.find(
        tokenBalance => tokenBalance.token.address.toLowerCase() === feeTokenAddress.toLowerCase(),
    );
    if (!balance) {
        throw new Error(`Unknown fee token: ${feeTokenAddress}`);
    }
    if (!balance.isUnlocked) {
        return {
            kind: StepKind.ToggleTokenLock,
            token: balance.token,
            isUnlocked: false,
            context: 'order',
        };
    }
    return null;
};

export const getUnlockZrxStepIfNeeded = (tokenBalances: TokenBalance[]): StepToggleTokenLock | null => {
    const zrxTokenBalance: TokenBalance = tokenBalances.find(tokenBalance =>
        isZrx(tokenBalance.token.symbol),
    ) as TokenBalance;
    if (zrxTokenBalance.isUnlocked) {
        return null;
    } else {
        return {
            kind: StepKind.ToggleTokenLock,
            token: zrxTokenBalance.token,
            isUnlocked: false,
            context: 'order',
        };
    }
};
// tslint:disable:max-file-line-count
