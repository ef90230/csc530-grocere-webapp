import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import TopBar from '../components/common/TopBar';
import { getOrderItemStatus } from '../utils/orderItemStatus';
import { clearActiveWalkTimeLimit, isTimeLimitedCommodity, setActiveWalkTimeLimit } from '../utils/walkTimeLimit';
import './PickListPage.css';

const API_BASE = process.env.NODE_ENV === 'production' ? '' : (process.env.REACT_APP_API_URL || 'http://localhost:5000');

const PickListPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [queue, setQueue] = useState([]);
  const [completedUnits, setCompletedUnits] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [commodity, setCommodity] = useState(location.state?.commodity || '');
  const [commodityLabel, setCommodityLabel] = useState(location.state?.commodityLabel || 'Pick');
  const [walkStartedAt, setWalkStartedAt] = useState(null);

  useEffect(() => {
    const token = window.localStorage.getItem('authToken');
    const userType = window.localStorage.getItem('userType');

    if (!token || (userType !== 'employee' && userType !== 'admin')) {
      navigate('/');
      return undefined;
    }

    const controller = new AbortController();

    const loadPickList = async () => {
      try {
        setIsLoading(true);
        setErrorMessage('');

        const providedStoreId = Number(location.state?.storeId);
        let resolvedStoreId = Number.isInteger(providedStoreId) && providedStoreId > 0 ? providedStoreId : 0;

        if (!resolvedStoreId) {
          const profileResponse = await fetch(`${API_BASE}/api/auth/me`, {
            headers: {
              Authorization: `Bearer ${token}`
            },
            signal: controller.signal
          });

          if (!profileResponse.ok) {
            throw new Error('Unable to load employee profile.');
          }

          const profilePayload = await profileResponse.json();
          resolvedStoreId = Number(profilePayload?.user?.storeId || 0);
        }

        if (!resolvedStoreId) {
          throw new Error('No store is assigned to this employee.');
        }

        const pickListResponse = await fetch(`${API_BASE}/api/orders/picking/walk/list/${resolvedStoreId}`, {
          headers: {
            Authorization: `Bearer ${token}`
          },
          signal: controller.signal
        });

        if (!pickListResponse.ok) {
          throw new Error('Unable to load the current pick list.');
        }

        const pickListPayload = await pickListResponse.json();

        setQueue(Array.isArray(pickListPayload?.queue) ? pickListPayload.queue : []);
        setCompletedUnits(Math.max(0, Number(pickListPayload?.completedUnits || 0)));
        const resolvedCommodity = String(pickListPayload?.commodity || location.state?.commodity || '');
        const resolvedCommodityLabel = String(pickListPayload?.displayName || location.state?.commodityLabel || 'Pick');
        const resolvedWalkStartedAt = pickListPayload?.walkStartedAt || null;

        setCommodity(resolvedCommodity);
        setCommodityLabel(resolvedCommodityLabel);
        setWalkStartedAt(resolvedWalkStartedAt);

        if (isTimeLimitedCommodity(resolvedCommodity) && resolvedWalkStartedAt) {
          setActiveWalkTimeLimit({
            commodity: resolvedCommodity,
            commodityLabel: resolvedCommodityLabel,
            storeId: resolvedStoreId,
            walkStartedAt: resolvedWalkStartedAt
          });
        } else {
          clearActiveWalkTimeLimit();
        }
      } catch (error) {
        if (error.name !== 'AbortError') {
          console.error('Unable to load pick list', error);
          setErrorMessage(error.message || 'Unable to load the current pick list.');
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    };

    loadPickList();
    const intervalId = window.setInterval(loadPickList, 15000);

    return () => {
      controller.abort();
      window.clearInterval(intervalId);
    };
  }, [location.state, navigate]);

  const remainingUnits = useMemo(() => (
    queue.reduce((sum, row) => sum + Math.max(0, Number(row?.quantityToPick || 0)), 0)
  ), [queue]);

  const walkTotalUnits = completedUnits + remainingUnits;

  const handleBack = () => {
    if (commodity) {
      navigate('/picking', {
        state: {
          commodity,
          commodityLabel
        }
      });
      return;
    }

    navigate('/commodityselect');
  };

  return (
    <div className="pick-list-page">
      <TopBar
        title="Pick List"
        leftActionLabel="<"
        leftActionAriaLabel="Back to current pick walk"
        onLeftAction={handleBack}
        statMode="walk"
        walkCompletedUnits={completedUnits}
        walkTotalUnits={walkTotalUnits}
        walkStartedAt={walkStartedAt}
      />

      <main className="pick-list-page__content">
        {errorMessage ? (
          <section className="pick-list-page__empty pick-list-page__empty--error">
            <h2>Unable to load pick list</h2>
            <p>{errorMessage}</p>
          </section>
        ) : null}

        {!errorMessage && isLoading ? (
          <section className="pick-list-page__empty">
            <h2>Loading pick list…</h2>
          </section>
        ) : null}

        {!errorMessage && !isLoading && queue.length === 0 ? (
          <section className="pick-list-page__empty">
            <h2>No active pick walk</h2>
            <p>Return to commodity select to start a new walk.</p>
          </section>
        ) : null}

        {!errorMessage && !isLoading && queue.length > 0 ? (
          <section className="pick-list-page__list" aria-label="Current pick walk list">
            {queue.map((row) => {
              const status = getOrderItemStatus(row);
              const symbol = String(row?.orderSymbol || '').trim().toLowerCase();

              return (
                <article key={row.orderItemId} className="pick-list-page__row">
                  <div className="pick-list-page__details">
                    <div className="pick-list-page__header">
                      <h2>{row?.item?.name || 'Unknown item'}</h2>
                      <span className="pick-list-page__qty">{Math.max(0, Number(row?.quantity || 0))} QTY</span>
                    </div>
                    <div className="pick-list-page__meta">
                      <strong>Order {row?.orderNumber || 'Unavailable'}</strong>
                    </div>
                    <span className={`pick-list-page__status pick-list-page__status--${status.kind}`}>{status.label}</span>
                  </div>

                  <div className="pick-list-page__image-wrap">
                    {row?.item?.imageUrl ? (
                      <img src={row.item.imageUrl} alt={row?.item?.name || 'Item'} />
                    ) : (
                      <div className="pick-list-page__image-placeholder">ITEM IMAGE HERE</div>
                    )}
                  </div>

                  <div className={`pick-list-page__symbol${symbol ? ` pick-list-page__symbol--${symbol}` : ''}`}>
                    {String(row?.orderSymbol || '').trim().toUpperCase() || '—'}
                  </div>
                </article>
              );
            })}
          </section>
        ) : null}
      </main>
    </div>
  );
};

export default PickListPage;
