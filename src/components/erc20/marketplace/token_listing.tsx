import React, { ChangeEvent, useState } from 'react';
import CopyToClipboard from 'react-copy-to-clipboard';
import { useSelector } from 'react-redux';
import styled from 'styled-components';

import { FEE_RECIPIENT } from '../../../common/constants';
import { getEthAccount } from '../../../store/selectors';
import {
    generateERC20MarketTradeLink,
    generateERC20TradeLink,
    generateIEODashboardLink,
    generateIEOInstantLink,
    generateInstantLink,
    generateTrustWalletDeepLink,
} from '../../../util/dex_urls';
import { Card } from '../../common/card';

const StyledListingsCard = styled(Card)`
    padding: 10px;
`;

const StyledP = styled.p`
    color: ${props => props.theme.componentsTheme.textColorCommon};
`;

const StyledH1 = styled.h2`
    color: ${props => props.theme.componentsTheme.textColorCommon};
`;

const LabelCopy = styled.span`
    color: ${props => props.theme.componentsTheme.textColorCommon};
    &:hover {
        cursor: pointer;
        text-decoration: underline;
    }
`;
const IsCopied = styled.span`
    color: ${props => props.theme.componentsTheme.red};
`;

const Input = styled.input`
    ::-webkit-inner-spin-button,
    ::-webkit-outer-spin-button {
        -webkit-appearance: none;
        margin: 0;
    }
    -moz-appearance: textfield;
    width: 390px;
`;

export const TokensListing = () => {
    let content: React.ReactNode;
    const ethAccount = useSelector(getEthAccount);
    const [address, setAddress] = useState('0x');
    const [isCopy, setIsCopy] = useState(false);
    const [copyIndex, setCopyIndex] = useState(0);
    const [makerAddress, setMakerAddress] = useState(ethAccount || '0x');
    const updateValue = (event: ChangeEvent<HTMLInputElement>) => {
        const value = event.target.value;
        setAddress(value.trim().toLowerCase());
    };
    const updateValueMaker = (event: ChangeEvent<HTMLInputElement>) => {
        const value = event.target.value;
        setMakerAddress(value.trim().toLowerCase());
    };

    const input = <Input onChange={updateValue} type={'text'} value={address} placeholder={'Type Token Address'} />;

    const inputMaker = (
        <Input onChange={updateValueMaker} type={'text'} value={makerAddress} placeholder={'Type Maker Address'} />
    );
    // <CopyToClipboard text={'0x5265bde27f57e738be6c1f6ab3544e82cdc92a8f'}>0x5265bde27f57e738be6c1f6ab3544e82cdc92a8f: Click to copy</CopyToClipboard>

    const erc20TradeLink = generateERC20TradeLink(address);
    const instantLink = generateInstantLink(address);
    const erc20TradeTrustLink = generateTrustWalletDeepLink(erc20TradeLink);
    const instantTrustLink = generateTrustWalletDeepLink(instantLink);
    const marketTradeLink = generateERC20MarketTradeLink(address);
    const ieoDashboardLink = generateIEODashboardLink(address, makerAddress);
    const ieoInstantLink = generateIEOInstantLink(address, makerAddress);
    const ieoInstantTrustLink = generateTrustWalletDeepLink(ieoInstantLink);

    const feeRecipient = FEE_RECIPIENT;
    const CopyContent = (text: string, label: string, index: number) => {
        const onCopy = () => {
            setIsCopy(true);
            setCopyIndex(index);
            setTimeout(() => {
                setIsCopy(false);
            }, 1000);
        };
        return (
            <CopyToClipboard text={text} onCopy={onCopy}>
                <LabelCopy>
                    {label}: Click to copy {isCopy && copyIndex === index && <IsCopied>Copied</IsCopied>}{' '}
                </LabelCopy>
            </CopyToClipboard>
        );
    };

    content = (
        <>
            <StyledH1>Add A Token To SwitchDex</StyledH1>
            <StyledP>
                SwitchDex allows you to trade any ERC20 token, any time, and we charge 0 fees for listing.
            </StyledP>
            <StyledP>
                To add a token to SwitchDex, simply past the contract address in the box below and your trading URL's
                will be generated instantly.
            </StyledP>
            <StyledP>Type your contract address to generate the url's: {input} </StyledP>
            <StyledP>Trade URL: {CopyContent(erc20TradeLink, erc20TradeLink, 1)}</StyledP>

            <StyledP>Market Trade URL: {CopyContent(marketTradeLink, marketTradeLink, 2)}</StyledP>

            <StyledP>Easy Buy URL: {CopyContent(instantLink, instantLink, 3)}</StyledP>

            <StyledP>
                Buy with Trust Wallet Links:
                <li> Trade URL: {CopyContent(erc20TradeTrustLink, erc20TradeTrustLink, 4)}</li>
                <li>Easy Buy URL: {CopyContent(instantTrustLink, instantTrustLink, 5)}</li>
            </StyledP>

            {/* <StyledH1>IEO Listings</StyledH1>

            <StyledP>
                {' '}
                <StyledP>
                Project listings on Switch Dex follows strict rules for deployment please reach our telegram for discussing.
            </StyledP>
            </StyledP>

            <StyledP>
                If you don't wanna list your token as default and get your IEO running, the UI also support insert token contract
                directly
            </StyledP>

            <StyledP> 1- Place orders at follow dashboard with your maker address: {inputMaker} </StyledP>
            <StyledP>Dashboard URL: {CopyContent(ieoDashboardLink, ieoDashboardLink, 7)}</StyledP>
            <StyledP>
                {' '}
                2 - You need to join as market maker clicking on the green button present on the dashboard{' '}
            </StyledP>

            <StyledP>After you place orders, your users can get your token directly using the following links:</StyledP>
            <StyledP> Buy with WebBrowser: {CopyContent(ieoInstantLink, ieoInstantLink, 8)}</StyledP>
           <StyledP> Buy with Trust: {CopyContent(ieoInstantTrustLink, ieoInstantTrustLink, 9)}</StyledP>*/}
        </>
    );

    return <StyledListingsCard title="Add A Token To SwitchDex">{content}</StyledListingsCard>;
};
