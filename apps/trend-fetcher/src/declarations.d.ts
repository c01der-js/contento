declare module 'google-trends-api' {
  interface DailyTrendsOptions {
    geo?: string
  }
  const googleTrends: {
    dailyTrends(opts: DailyTrendsOptions): Promise<string>
  }
  export default googleTrends
}
