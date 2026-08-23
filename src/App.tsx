import { Header, Footer } from './components/Header.js';
import { ErrorAlert } from './components/TxStatus.js';
import { WalletProvider, useWallet } from './hooks/useWallet.js';
import { useHashRoute } from './hooks/useHashRoute.js';
import { Landing } from './pages/Landing.js';
import { Dashboard } from './pages/Dashboard.js';
import { CreateAuction } from './pages/CreateAuction.js';
import { AuctionDetail } from './pages/AuctionDetail.js';
import { MyParticipation } from './pages/MyParticipation.js';
import { PrivacyModel } from './pages/PrivacyModel.js';

function Routes() {
  const { segments, navigate } = useHashRoute();
  const { status, error, retry } = useWallet();

  const [head, param] = segments;
  let page;
  switch (head ?? '') {
    case '':
      page = <Landing />;
      break;
    case 'auctions':
      page = <Dashboard navigate={navigate} />;
      break;
    case 'create':
      page = <CreateAuction navigate={navigate} />;
      break;
    case 'auction': {
      const id = BigInt(/^\d+$/.test(param ?? '') ? (param as string) : '-1');
      page = <AuctionDetail id={id} />;
      break;
    }
    case 'my':
      page = <MyParticipation />;
      break;
    case 'privacy':
      page = <PrivacyModel />;
      break;
    default:
      page = (
        <div className="empty-state card" style={{ maxWidth: 420, margin: '80px auto' }}>
          <div className="big">🕳️</div>
          <h3>Page not found</h3>
          <a className="btn btn-primary" href="#/">Back home</a>
        </div>
      );
  }

  return (
    <>
      <Header />
      {status === 'error' && error && (
        <div style={{ maxWidth: 1100, margin: '14px auto 0', padding: '0 20px' }}>
          <ErrorAlert message={`Connection problem: ${error}`} onRetry={retry} />
        </div>
      )}
      {page}
      <Footer />
    </>
  );
}

export default function App() {
  return (
    <WalletProvider>
      <Routes />
    </WalletProvider>
  );
}
