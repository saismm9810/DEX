import { BigNumber } from '@0x/utils';
import React, { HTMLAttributes } from 'react';
import { connect } from 'react-redux';
import styled from 'styled-components';

import { USE_RELAYER_MARKET_UPDATES } from '../../../common/constants';
import { getMarketFilters } from '../../../common/markets';
import { changeMarket, goToHome } from '../../../store/actions';
import {
    getBaseToken,
    getCurrencyPair,
    getMarkets,
    getMarketsStats,
    getMarketsStatsState,
    getQuoteToken,
    getWeb3State,
} from '../../../store/selectors';
import { themeBreakPoints, themeDimensions } from '../../../themes/commons';
import { filterMarketsByString, filterMarketsByTokenSymbol, marketToString } from '../../../util/markets';
import { formatTokenSymbol } from '../../../util/tokens';
import {
    CurrencyPair,
    Filter,
    Market,
    RelayerMarketStats,
    ServerState,
    StoreState,
    Token,
    Web3State,
} from '../../../util/types';
import { Card } from '../../common/card';
import { EmptyContent } from '../../common/empty_content';
import { MagnifierIcon } from '../../common/icons/magnifier_icon';
import { LoadingWrapper } from '../../common/loading';
import { CustomTD, CustomTDLast, Table, TBody, THead, THFirst, THLast, TR } from '../../common/table';

interface PropsDivElement extends HTMLAttributes<HTMLDivElement> {}

interface DispatchProps {
    changeMarket: (currencyPair: CurrencyPair) => any;
    goToHome: () => any;
}

interface PropsToken {
    baseToken: Token | null;
    currencyPair: CurrencyPair;
    markets: Market[] | null;
    marketsStats: RelayerMarketStats[] | null | undefined;
    web3State?: Web3State;
    quoteToken: Token | null;
    marketsStatsState: ServerState;
}

type Props = PropsDivElement & PropsToken & DispatchProps;

interface State {
    selectedFilter: Filter;
    search: string;
}

interface TokenFiltersTabProps {
    active: boolean;
    onClick: number;
}

interface MarketRowProps {
    active: boolean;
}

const rowHeight = '48px';

const MarketStatsListCard = styled(Card)`
    height: 100%;
    margin-top: 0px;
`;

const MarketsFilters = styled.div`
    align-items: center;
    border-bottom: 1px solid ${props => props.theme.componentsTheme.dropdownBorderColor};
    display: flex;
    justify-content: space-between;
    min-height: ${rowHeight};
    padding: 8px 8px 8px ${themeDimensions.horizontalPadding};
`;

const TokenFiltersTabs = styled.div`
    align-items: center;
    display: flex;
    margin-right: 10px;
`;

const TokenFiltersTab = styled.span<TokenFiltersTabProps>`
    color: ${props =>
        props.active ? props.theme.componentsTheme.textColorCommon : props.theme.componentsTheme.lightGray};
    cursor: pointer;
    font-size: 12px;
    user-select: none;

    &:after {
        color: ${props => props.theme.componentsTheme.lightGray};
        content: '/';
        margin: 0 6px;
    }

    &:last-child:after {
        display: none;
    }
`;

const searchFieldHeight = '32px';
const searchFieldWidth = '100%';

const SearchWrapper = styled.div`
    height: ${searchFieldHeight};
    position: relative;
    width: 100%;
`;

const SearchField = styled.input`
    background: ${props => props.theme.componentsTheme.textInputBackgroundColor};
    border-radius: ${themeDimensions.borderRadius};
    border: 1px solid ${props => props.theme.componentsTheme.textInputBorderColor};
    color: ${props => props.theme.componentsTheme.textInputTextColor};
    font-size: 12px;
    height: ${searchFieldHeight};
    left: 0;
    outline: none;
    padding: 0 15px 0 30px;
    position: absolute;
    top: 0;
    width: ${searchFieldWidth};
    z-index: 1;

    &:focus {
        border-color: ${props => props.theme.componentsTheme.textInputBorderColor};
    }
`;

const MagnifierIconWrapper = styled.div`
    line-height: 30px;
    height: 100%;
    left: 11px;
    position: absolute;
    top: 0;
    width: 14px;
    z-index: 12;
`;

const TableWrapper = styled.div`
    max-height: 100%;
    overflow: auto;
    position: relative;
`;

const PriceChange = styled.span<{ value: number }>`
    color: ${props =>
        props.value > 0 ? props.theme.componentsTheme.green : props.value < 0 ? props.theme.componentsTheme.red : null};
    display: block;
`;

const verticalCellPadding = `
    padding-bottom: 10px;
    padding-top: 10px;
`;

const tableHeaderFontWeight = `
`;

const TRStyled = styled(TR)<MarketRowProps>`
    background-color: ${props => (props.active ? props.theme.componentsTheme.rowActive : 'transparent')};
    cursor: ${props => (props.active ? 'default' : 'pointer')};

    &:hover {
        background-color: ${props => props.theme.componentsTheme.rowActive};
    }

    &:last-child > td {
        border-bottom-left-radius: ${themeDimensions.borderRadius};
        border-bottom-right-radius: ${themeDimensions.borderRadius};
        border-bottom: none;
    }
`;

// Has a special left-padding: needs a specific selector to override the theme
const THFirstStyled = styled(THFirst)`
    ${verticalCellPadding}
    ${tableHeaderFontWeight}
    font-size: ${props => props.theme.componentsTheme.marketStatsTHFontSize};
    &, &:last-child {
        padding-left: 12px;
    }
`;

const THLastStyled = styled(THLast)`
    ${verticalCellPadding};
    ${tableHeaderFontWeight}
    font-size: ${props => props.theme.componentsTheme.marketStatsTHFontSize};
`;

const CustomTDFirstStyled = styled(CustomTD)`
    ${verticalCellPadding};
    padding-left: 0px;
    font-size: ${props => props.theme.componentsTheme.marketStatsTDFontSize};
`;

const CustomTDLastStyled = styled(CustomTDLast)`
    ${verticalCellPadding};
    font-size: ${props => props.theme.componentsTheme.marketStatsTDFontSize};
`;

const TokenIconAndLabel = styled.div`
    align-items: center;
    display: flex;
    justify-content: flex-start;
    @media (max-width: ${themeBreakPoints.md}) {
        flex-wrap: wrap;
        justify-content: center;
    }
`;

const TokenLabel = styled.div`
    color: ${props => props.theme.componentsTheme.textColorCommon};
    font-size: 12px;
    margin: 0 0 0 12px;
`;

class MarketsStatsList extends React.Component<Props, State> {
    public readonly state: State = {
        selectedFilter: getMarketFilters()[0],
        search: '',
    };

    public render = () => {
        const { baseToken, quoteToken, web3State, markets, marketsStats, marketsStatsState } = this.props;
        let content: React.ReactNode;
        const defaultBehaviour = () => {
            if (!baseToken || !quoteToken || marketsStatsState === ServerState.NotLoaded) {
                content = <LoadingWrapper minHeight="120px" />;
            } else if (!baseToken || !quoteToken) {
                content = <EmptyContent alignAbsoluteCenter={true} text="There are no market details to show" />;
            } else if (!markets && !marketsStats) {
                content = <LoadingWrapper minHeight="120px" />;
            } else {
                content = (
                    <>
                        <MarketsFilters>{this._getSearchField()}</MarketsFilters>
                        <MarketsFilters>{this._getTokensFilterTabs()}</MarketsFilters>
                        <TableWrapper>{this._getMarkets()}</TableWrapper>
                    </>
                );
            }
        };
        if (USE_RELAYER_MARKET_UPDATES) {
            defaultBehaviour();
        } else {
            switch (web3State) {
                case Web3State.Locked:
                case Web3State.NotInstalled: {
                    content = <EmptyContent alignAbsoluteCenter={true} text="There are no market details to show" />;
                    break;
                }
                case Web3State.Loading: {
                    content = <LoadingWrapper minHeight="120px" />;
                    break;
                }
                default: {
                    defaultBehaviour();
                    break;
                }
            }
        }

        return <MarketStatsListCard disableOverflowBody={true}>{content}</MarketStatsListCard>;
    };

    private readonly _getTokensFilterTabs = () => {
        return (
            <TokenFiltersTabs>
                {getMarketFilters().map((filter: Filter, index) => {
                    return (
                        <TokenFiltersTab
                            active={filter === this.state.selectedFilter}
                            key={index}
                            onClick={this._setTokensFilterTab.bind(this, filter)}
                        >
                            {filter.text}
                        </TokenFiltersTab>
                    );
                })}
            </TokenFiltersTabs>
        );
    };

    private readonly _setTokensFilterTab: any = (filter: Filter) => {
        this.setState({ selectedFilter: filter });
    };

    private readonly _getSearchField = () => {
        return (
            <SearchWrapper>
                <MagnifierIconWrapper>{MagnifierIcon()}</MagnifierIconWrapper>
                <SearchField onChange={this._handleChange} value={this.state.search} placeholder={'Search Market'} />
            </SearchWrapper>
        );
    };

    private readonly _handleChange = (e: any) => {
        const search = e.currentTarget.value;

        this.setState({
            search,
        });
    };

    private readonly _getMarkets = () => {
        const { baseToken, currencyPair, markets, marketsStats } = this.props;
        const { search, selectedFilter } = this.state;

        if (!baseToken || !markets) {
            return null;
        }

        const filteredMarkets =
            selectedFilter == null || selectedFilter.value === null
                ? markets
                : filterMarketsByTokenSymbol(markets, selectedFilter.value);
        const searchedMarkets = filterMarketsByString(filteredMarkets, search);

        return (
            <Table>
                <THead>
                    <TR>
                        <THFirstStyled styles={{ textAlign: 'left' }}>Market</THFirstStyled>
                        <THLastStyled styles={{ textAlign: 'center' }}>Last Price</THLastStyled>
                        {/*  <THLastStyled styles={{ textAlign: 'center' }}>Change (%)</THLastStyled>*/}
                    </TR>
                </THead>
                <TBody>
                    {searchedMarkets.map((market, index) => {
                        const isActive =
                            market.currencyPair.base === currencyPair.base &&
                            market.currencyPair.quote === currencyPair.quote;
                        const setSelectedMarket = () => this._setSelectedMarket(market.currencyPair);
                        const baseSymbol = formatTokenSymbol(market.currencyPair.base).toUpperCase();
                        const quoteSymbol = formatTokenSymbol(market.currencyPair.quote).toUpperCase();
                        const marketStats =
                            marketsStats &&
                            marketsStats.find(m => m.pair.toUpperCase() === marketToString(market.currencyPair));
                        /*const color = marketStats
                            ? marketStats.last_price_change > 0
                                ? 'green'
                                : marketStats.last_price_change >= 0
                                ? ''
                                : 'red'
                            : '';*/
                        return (
                            <TRStyled active={isActive} key={index} onClick={setSelectedMarket}>
                                <CustomTDFirstStyled styles={{ textAlign: 'left', borderBottom: true }}>
                                    <TokenIconAndLabel>
                                        <TokenLabel>
                                            {baseSymbol} / {quoteSymbol}
                                        </TokenLabel>
                                    </TokenIconAndLabel>
                                </CustomTDFirstStyled>
                                <CustomTDLastStyled styles={{ textAlign: 'right', borderBottom: true, tabular: true }}>
                                    {this._getLastPrice(market, marketStats)}
                                    {this._getLastPriceChange(marketStats)}
                                </CustomTDLastStyled>
                                {/*<CustomTDLastStyled
                                    styles={{ textAlign: 'center', borderBottom: true, tabular: true, color }}
                                >
                                    {this._getPriceChange(marketStats)}
                                </CustomTDLastStyled>*/}
                            </TRStyled>
                        );
                    })}
                </TBody>
            </Table>
        );
    };

    private readonly _setSelectedMarket: any = (currencyPair: CurrencyPair) => {
        this.props.changeMarket(currencyPair);
        this.props.goToHome();
    };

    private readonly _getLastPrice: any = (market: Market, marketStat: RelayerMarketStats) => {
        if (marketStat && marketStat.last_price) {
            return new BigNumber(marketStat.last_price).toFixed(market.currencyPair.config.pricePrecision);
        }

        return '-';
    };
    private readonly _getLastPriceChange: any = (marketStat: RelayerMarketStats) => {
        if (marketStat && marketStat.last_price_change_24) {
            return (
                <PriceChange value={marketStat.last_price_change_24}>{`${new BigNumber(marketStat.last_price_change_24)
                    .times(100)
                    .toFixed(2)} %`}</PriceChange>
            );
        }

        return <PriceChange value={0}>{`${new BigNumber(0).toFixed(2)} %`}</PriceChange>;
    };
    /*private readonly _getPriceChange: any = (marketStat: RelayerMarketStats) => {
        if (marketStat && marketStat.last_price_change) {
            return `${new BigNumber(marketStat.last_price_change).toFixed(2)} %`;
        }

        return '-';
    };*/
    /*private readonly _getVolume: any = (marketStat: RelayerMarketStats) => {
        if (marketStat && marketStat.quote_volume_24) {
            return new BigNumber(marketStat.quote_volume_24).toFixed(2);
        }

        return '-';
    };*/
}

const mapStateToProps = (state: StoreState): PropsToken => {
    return {
        baseToken: getBaseToken(state),
        currencyPair: getCurrencyPair(state),
        markets: getMarkets(state),
        quoteToken: getQuoteToken(state),
        web3State: getWeb3State(state),
        marketsStats: getMarketsStats(state),
        marketsStatsState: getMarketsStatsState(state),
    };
};

const mapDispatchToProps = (dispatch: any): DispatchProps => {
    return {
        changeMarket: (currencyPair: CurrencyPair) => dispatch(changeMarket(currencyPair)),
        goToHome: () => dispatch(goToHome()),
    };
};

const MarketsStatsListContainer = connect(mapStateToProps, mapDispatchToProps)(MarketsStatsList);

export { MarketsStatsList, MarketsStatsListContainer };
