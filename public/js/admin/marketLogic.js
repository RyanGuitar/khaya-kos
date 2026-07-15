// Visibility rule for the live market. The owner must be able to prepare
// stock while closed; visitors only see market items while it is live.
export function shouldShowMarketItems(isOpen, isAdmin) {
  return isAdmin || Boolean(isOpen);
}
