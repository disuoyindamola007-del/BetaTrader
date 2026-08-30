import { useEffect } from 'react';

// Scroll to top whenever the active tab or selected item changes.
// This ensures users always start at the top when navigating to a new page.
export default function ScrollToTop({ activeTab, selectedAsset, selectedNews, selectedPulseMetric }) {
  useEffect(() => {
    const main = document.querySelector('main');
    if (main) {
      main.scrollTop = 0;
    }
    window.scrollTo(0, 0);
  }, [activeTab, selectedAsset?.symbol, selectedNews?.id, selectedPulseMetric?.label]);

  return null;
}
