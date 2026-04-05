import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../components/common/Navbar';
import TopBar from '../components/common/TopBar';
import './HomePage.css';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:5000';
const WAIT_THRESHOLD_STORAGE_KEY = 'grocereWaitThresholdMinutes';
const DEFAULT_WAIT_THRESHOLD_MINUTES = 5;

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const getStoredThreshold = () => {
  const storedValue = Number(window.localStorage.getItem(WAIT_THRESHOLD_STORAGE_KEY));
  if (Number.isInteger(storedValue) && storedValue >= 1 && storedValue <= 60) {
    return storedValue;
  }

  return DEFAULT_WAIT_THRESHOLD_MINUTES;
};

const isTerminalStatus = (statusValue) => {
  const status = String(statusValue || '').toLowerCase();
  return status === 'completed' || status === 'cancelled';
};

const isResolvedItem = (item) => {
  const normalizedStatus = String(item?.status || '').toLowerCase();
  const quantity = Math.max(0, toNumber(item?.quantity));
  const pickedQuantity = Math.max(0, toNumber(item?.pickedQuantity));

  if (normalizedStatus === 'found' || normalizedStatus === 'substituted') {
    return true;
  }

  if (normalizedStatus === 'out_of_stock' || normalizedStatus === 'skipped' || normalizedStatus === 'not_found') {
    return true;
  }

  return pickedQuantity >= quantity && quantity > 0;
};

const getRemainingPickUnits = (order) => {
  const items = Array.isArray(order?.items) ? order.items : [];

  return items.reduce((sum, item) => {
    if (isResolvedItem(item)) {
      return sum;
    }

    const quantity = Math.max(0, toNumber(item?.quantity));
    const pickedQuantity = Math.max(0, toNumber(item?.pickedQuantity));
    return sum + Math.max(0, quantity - pickedQuantity);
  }, 0);
};

const getOrderToteCount = (order) => {
  const items = Array.isArray(order?.items) ? order.items : [];
  const commoditySet = new Set(
    items
      .map((item) => String(item?.item?.commodity || '').toLowerCase())
      .filter(Boolean)
  );

  return commoditySet.size;
};

const formatPickRate = (value) => {
  if (!Number.isFinite(value)) {
    return '0.00';
  }

  return value.toFixed(2);
};

const getTimeOfDayLabel = (dateValue = new Date()) => {
  const hour = dateValue.getHours();

  if (hour >= 3 && hour < 12) {
    return 'morning';
  }

  if (hour >= 12 && hour < 18) {
    return 'afternoon';
  }

  return 'evening';
};

const HomePage = () => {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(true);
  const [orders, setOrders] = useState([]);
  const [stagingAssignments, setStagingAssignments] = useState([]);
  const [pickRate, setPickRate] = useState(0);

  useEffect(() => {
    const token = window.localStorage.getItem('authToken');

    if (!token) {
      setIsLoading(false);
      return;
    }

    const loadHomeStats = async () => {
      setIsLoading(true);

      try {
        const headers = {
          Authorization: `Bearer ${token}`
        };

        const [ordersResponse, assignmentsResponse, profileResponse] = await Promise.all([
          fetch(`${API_BASE}/api/orders`, { headers }),
          fetch(`${API_BASE}/api/staging-locations/assignments`, { headers }),
          fetch(`${API_BASE}/api/auth/me`, { headers })
        ]);

        if (ordersResponse.ok) {
          const ordersPayload = await ordersResponse.json();
          setOrders(Array.isArray(ordersPayload?.orders) ? ordersPayload.orders : []);
        } else {
          setOrders([]);
        }

        if (assignmentsResponse.ok) {
          const assignmentsPayload = await assignmentsResponse.json();
          setStagingAssignments(Array.isArray(assignmentsPayload?.assignments) ? assignmentsPayload.assignments : []);
        } else {
          setStagingAssignments([]);
        }

        if (profileResponse.ok) {
          const profilePayload = await profileResponse.json();
          setPickRate(toNumber(profilePayload?.user?.pickRate));
        } else {
          setPickRate(0);
        }
      } catch {
        setOrders([]);
        setStagingAssignments([]);
        setPickRate(0);
      } finally {
        setIsLoading(false);
      }
    };

    loadHomeStats();
  }, []);

  const dashboardStats = useMemo(() => {
    const waitThresholdMinutes = getStoredThreshold();
    const stagedToteCountByOrderId = stagingAssignments.reduce((countMap, assignment) => {
      const orderId = toNumber(assignment?.orderId);
      if (!orderId) {
        return countMap;
      }

      countMap.set(orderId, (countMap.get(orderId) || 0) + 1);
      return countMap;
    }, new Map());

    const activeOrders = orders.filter((order) => !isTerminalStatus(order?.status));

    const pickingItemsAvailable = activeOrders.reduce((sum, order) => {
      const normalizedStatus = String(order?.status || '').toLowerCase();
      if (!['pending', 'assigned', 'picking', 'picked', 'staging', 'staged', 'ready', 'dispensing'].includes(normalizedStatus)) {
        return sum;
      }

      return sum + getRemainingPickUnits(order);
    }, 0);

    const totesLeftToStage = activeOrders.reduce((sum, order) => {
      const normalizedStatus = String(order?.status || '').toLowerCase();
      if (normalizedStatus === 'ready' || normalizedStatus === 'dispensing') {
        return sum;
      }

      const totalTotes = getOrderToteCount(order);
      const stagedTotes = toNumber(stagedToteCountByOrderId.get(toNumber(order?.id)) || order?.stagedToteCount || 0);
      return sum + Math.max(0, totalTotes - stagedTotes);
    }, 0);

    const checkedInCars = activeOrders.filter((order) => Boolean(order?.isCheckedIn)).length;
    const now = Date.now();
    const longWaits = activeOrders.filter((order) => {
      if (!order?.isCheckedIn || !order?.checkInTime) {
        return false;
      }

      const checkInTime = new Date(order.checkInTime).getTime();
      if (!Number.isFinite(checkInTime)) {
        return false;
      }

      const waitSeconds = Math.max(0, (now - checkInTime) / 1000);
      return waitSeconds >= waitThresholdMinutes * 60;
    }).length;

    const nonCancelledOrders = orders.filter((order) => String(order?.status || '').toLowerCase() !== 'cancelled');
    const completedOrders = nonCancelledOrders.filter((order) => String(order?.status || '').toLowerCase() === 'completed').length;

    return {
      pickingItemsAvailable,
      totesLeftToStage,
      checkedInCars,
      longWaits,
      completedOrders,
      totalTrackableOrders: nonCancelledOrders.length,
      storePickRate: pickRate
    };
  }, [orders, pickRate, stagingAssignments]);

  const timeOfDayLabel = useMemo(() => getTimeOfDayLabel(), []);

  return (
    <div className="home-page">
      <TopBar />
      <div className="home-content">
        <div className="home-hero">
          <h1>Good {timeOfDayLabel}!</h1>
          <p>Here are your store&apos;s current fulfillment tasks and stats.</p>
        </div>
        <div className="buttons-column">
          <button
            className="home-action-button picking-btn"
            onClick={() => navigate('/commodityselect')}
          >
            <span className="home-card-title">Picking</span>
            <span className="home-card-stat">{isLoading ? '...' : dashboardStats.pickingItemsAvailable} items available</span>
            <span className="home-card-stat">{isLoading ? '...' : formatPickRate(dashboardStats.storePickRate)} store pick rate</span>
          </button>
          <button
            className="home-action-button staging-btn"
            onClick={() => navigate('/staging')}
          >
            <span className="home-card-title">Staging</span>
            <span className="home-card-stat">{isLoading ? '...' : dashboardStats.totesLeftToStage} totes left to stage</span>
          </button>
          <button
            className="home-action-button orders-btn"
            onClick={() => navigate('/orders')}
          >
            <span className="home-card-title">Order Fulfillment</span>
            <span className="home-card-stat">{isLoading ? '...' : dashboardStats.checkedInCars} cars checked in</span>
            <span className="home-card-stat">{isLoading ? '...' : dashboardStats.longWaits} long waits</span>
          </button>
          <button
            className="home-action-button inventory-btn"
            onClick={() => navigate('/inventory')}
          >
            <span className="home-card-title">Store Management</span>
            <span className="home-card-stat">
              {isLoading ? '.../... orders complete' : `${dashboardStats.completedOrders}/${dashboardStats.totalTrackableOrders} orders complete`}
            </span>
          </button>
        </div>
      </div>
      <Navbar />
    </div>
  );
};

export default HomePage;