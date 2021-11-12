import { ExchangeFillEventArgs, LogWithDecodedArgs } from '@0x/contract-wrappers';
import { assetDataUtils } from '@0x/order-utils';
import { AssetProxyId, ERC20AssetData } from '@0x/types';
import { Web3Wrapper } from '@0x/web3-wrapper';

import { KNOWN_TOKENS_META_DATA, TokenMetaData } from '../common/tokens_meta_data';
import { KNOWN_TOKENS_IEO_META_DATA } from '../common/tokens_meta_data_ieo';
import { getERC20ContractWrapper } from '../services/contract_wrappers';
import { getTokenMetaData } from '../services/relayer';
import { getTokenByAddress } from '../services/tokens';
import { getLogger } from '../util/logger';

import { mapTokensIEOMetaDataToTokenByNetworkId } from './token_ieo_meta_data';
import {
    getWethTokenFromTokensMetaDataByNetworkId,
    mapTokensMetaDataFromForm,
    mapTokensMetaDataToTokenByNetworkId,
} from './token_meta_data';
import { Token, TokenIEO } from './types';

const logger = getLogger('Tokens::known_tokens .ts');

export class KnownTokens {
    private _tokens: Token[] = [];
    private readonly _tokensIEO: Token[] = [];
    private readonly _wethToken: Token;

    constructor(knownTokensMetadata: TokenMetaData[]) {
        this._tokens = mapTokensMetaDataToTokenByNetworkId(knownTokensMetadata).filter(token => !isWeth(token.symbol));
        this._tokensIEO = mapTokensIEOMetaDataToTokenByNetworkId(KNOWN_TOKENS_IEO_META_DATA).filter(
            token => !isWeth(token.symbol),
        );
        this._wethToken = getWethTokenFromTokensMetaDataByNetworkId(knownTokensMetadata);
    }
    public updateTokens = (knownTokensMetadata: TokenMetaData[]) => {
        this._tokens = mapTokensMetaDataFromForm(knownTokensMetadata).filter(token => !isWeth(token.symbol));
    };

    public getTokenBySymbol = (symbol: string): Token => {
        const symbolInLowerCaseScore = symbol.toLowerCase();
        let token = this._tokens.find(t => t.symbol === symbolInLowerCaseScore);
        if (!token) {
            if (symbolInLowerCaseScore === 'weth') {
                return this.getWethToken();
            }
        }
        if (!token) {
            token = this._tokensIEO.find(t => t.symbol === symbolInLowerCaseScore);
        }
        if (!token) {
            const errorMessage = `Token with symbol ${symbol} not found in known tokens`;
            logger.log(errorMessage);
            throw new Error(errorMessage);
        }
        return token;
    };

    public getTokenByAddress = (address: string): Token => {
        const addressInLowerCase = address.toLowerCase();
        let token = this._tokens.find(t => t.address.toLowerCase() === addressInLowerCase);
        if (!token) {
            // If it's not on the tokens list, we check if it's an wETH token
            // TODO - Maybe the this._tokens could be refactored to also have wETH inside
            token = this._wethToken.address === address ? this._wethToken : undefined;
        }
        if (!token) {
            token = this._tokensIEO.find(t => t.address.toLowerCase() === addressInLowerCase);
        }
        if (!token) {
            throw new Error(`Token with address ${address} not found in known tokens`);
        }
        return token;
    };

    public getTokenIEOByAddress = (address: string): Token => {
        const addressInLowerCase = address.toLowerCase();
        const token = this._tokensIEO.find(t => t.address.toLowerCase() === addressInLowerCase);
        if (!token) {
            throw new Error(`Token with address ${address} not found in known tokens`);
        }
        return token;
    };

    public getTokenByAssetData = (assetData: string): Token => {
        const tokenAddress = (assetDataUtils.decodeAssetDataOrThrow(assetData) as ERC20AssetData).tokenAddress;
        return this.getTokenByAddress(tokenAddress);
    };

    public isKnownAddress = (address: string): boolean => {
        try {
            this.getTokenByAddress(address);
            return true;
        } catch (e) {
            return false;
        }
    };

    public isKnownSymbol = (symbol: string): boolean => {
        try {
            this.getTokenBySymbol(symbol);
            return true;
        } catch (e) {
            return false;
        }
    };

    public isIEOKnownAddress = (address: string): boolean => {
        try {
            this.getTokenIEOByAddress(address);
            return true;
        } catch (e) {
            return false;
        }
    };

    /**
     * Checks if a Fill event is valid.
     *
     * A Fill event is considered valid if the order involves two ERC20 tokens whose addresses we know.
     *
     */
    public isValidFillEvent = (fillEvent: LogWithDecodedArgs<ExchangeFillEventArgs>): boolean => {
        const { makerAssetData, takerAssetData } = fillEvent.args;

        if (!isERC20AssetData(makerAssetData) || !isERC20AssetData(takerAssetData)) {
            return false;
        }

        const makerAssetAddress = (assetDataUtils.decodeAssetDataOrThrow(makerAssetData) as ERC20AssetData)
            .tokenAddress;
        const takerAssetAddress = (assetDataUtils.decodeAssetDataOrThrow(takerAssetData) as ERC20AssetData)
            .tokenAddress;

        if (!this.isKnownAddress(makerAssetAddress) || !this.isKnownAddress(takerAssetAddress)) {
            return false;
        }

        return true;
    };
    public getTokenByName = (name: string): Token => {
        const nameInLowerCaseScore = name.toLowerCase();
        let token = this._tokens.find(t => t.name.toLowerCase() === nameInLowerCaseScore);
        if (!token) {
            token = this._tokensIEO.find(t => t.name.toLowerCase() === nameInLowerCaseScore);
        }
        if (!token) {
            throw new Error(`Token with name ${name} not found in known tokens`);
        }
        return token;
    };

    public getWethToken = (): Token => {
        return this._wethToken as Token;
    };

    public getTokens = (): Token[] => {
        return this._tokens;
    };
    public findToken = (data: string | null) => {
        if (!data) {
            return null;
        }
        if (this.isKnownSymbol(data)) {
            return this.getTokenBySymbol(data);
        }

        if (this.isKnownAddress(data)) {
            return this.getTokenByAddress(data);
        }
        return null;
    };
    /**
     * Try to find token, if not exists in current list it will try to
     * fetch it
     */
    public findTokenOrFetchIt = async (data: string | null) => {
        if (!data) {
            return null;
        }
        let token = this.findToken(data);
        if (token) {
            return token;
        } else {
            if (Web3Wrapper.isAddress(data)) {
                token = await this._fetchTokenMetadata(data);
                if (token) {
                    return token;
                } else {
                    return null;
                }
            }
        }
        return null;
    };
    public pushToken = (token: Token) => {
        this._tokens.push(token);
    };
    public pushTokenIEO = (token: TokenIEO) => {
        this._tokensIEO.push(token);
    };
    // Could be address or symbol
    public addTokenByAddress = async (data: string) => {
        if (this.isKnownSymbol(data) || this.isKnownAddress(data)) {
            return null;
        }
        if (Web3Wrapper.isAddress(data)) {
            const token = await this._fetchTokenMetadata(data);
            if (token) {
                this._tokens.push(token);
                return token;
            } else {
                return null;
            }
        }
    };
    /**
     * Adds metadata from Coingecko
     */
    public fetchTokenMetadaFromGecko = async (token: Token): Promise<Token> => {
        try {
            const tokenData = await getTokenByAddress(token.address.toLowerCase());
            const thumbImage = tokenData.image.thumb;
            let t;
            t = {
                ...token,
                c_id: tokenData.id,
                icon: thumbImage.substring(0, thumbImage.indexOf('?')),
                displayDecimals: 2,
                minAmount: 0,
            };
            return t;
        } catch (e) {
            return token;
        }
    };

    private readonly _fetchTokenMetadata = async (address: string): Promise<Token | null> => {
        try {
            let token = await getTokenMetadaDataFromContract(address);
            if (!token) {
                return null;
            }
            try {
                const tokenData = await getTokenByAddress(address.toLowerCase());
                const thumbImage = tokenData.image.thumb;
                token = {
                    ...token,
                    c_id: tokenData.id,
                    icon: thumbImage.substring(0, thumbImage.indexOf('?')),
                    displayDecimals: 2,
                    minAmount: 0,
                };
                return token;
            } catch (e) {
                return token;
            }
        } catch (e) {
            return null;
        }
    };
}

let knownTokens: KnownTokens;
export const getKnownTokens = (knownTokensMetadata: TokenMetaData[] = KNOWN_TOKENS_META_DATA): KnownTokens => {
    if (!knownTokens) {
        knownTokens = new KnownTokens(knownTokensMetadata);
    }
    return knownTokens;
};

export const getColorBySymbol = (symbol: string): string => {
    const token = KNOWN_TOKENS_META_DATA.find(t => t.symbol === symbol.toLowerCase());
    if (!token) {
        throw new Error(`Token with symbol ${symbol} not found in known tokens`);
    }

    return token.primaryColor;
};

export const getWethAssetData = (): string => {
    const known_tokens = getKnownTokens();
    const wethToken = known_tokens.getWethToken();
    return assetDataUtils.encodeERC20AssetData(wethToken.address).toLowerCase();
};

export const isZrx = (token: string): boolean => {
    return token === 'zrx';
};

export const isWeth = (token: string): boolean => {
    return token === 'weth';
};

export const isWhackd = (token: string): boolean => {
    return token === 'whackd';
};

export const isWethToken = (token: Token): boolean => {
    if (token.symbol.toLowerCase() === 'weth') {
        return true;
    } else {
        return false;
    }
};

export const isERC20AssetData = (assetData: string): boolean => {
    try {
        const asset = assetDataUtils.decodeAssetDataOrThrow(assetData);
        if (asset.assetProxyId === AssetProxyId.ERC20) {
            return true;
        } else {
            return false;
        }
    } catch (e) {
        return false;
    }
};

export const getTokenMetadaDataFromContract = async (address: string): Promise<Token | null> => {
    try {
        const contract = await getERC20ContractWrapper(address.toLowerCase(), {});
        const name = await contract.name().callAsync();
        const symbol = (await contract.symbol().callAsync()).toLowerCase();
        const decimals = Number(await contract.decimals().callAsync());
        const token: Token = {
            address: address.toLowerCase(),
            decimals,
            name,
            symbol,
            primaryColor: '#081e6e',
            displayDecimals: 2,
            minAmount: 0,
            listed: false,
            isStableCoin: false,
        };
        return token;
    } catch (e) {
        return null;
    }
};

export const getTokenMetadaDataFromServer = async (address: string): Promise<Token | null> => {
    try {
        const tokenData = await getTokenMetaData(address.toLowerCase());
        if (!tokenData) {
            return null;
        }
        const token: Token = {
            address: address.toLowerCase(),
            decimals: Number(tokenData.decimals),
            name: tokenData.name,
            symbol: tokenData.symbol,
            primaryColor: '#081e6e',
            displayDecimals: 2,
            minAmount: 0,
            listed: false,
            isStableCoin: false,
        };
        return token;
    } catch (e) {
        return null;
    }
};
