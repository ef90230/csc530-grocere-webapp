import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../components/common/Navbar';
import TopBar from '../components/common/TopBar';
import pickingButtonSymbol from '../assets/home-buttons/picking-button-symbol.png';
import stagingButtonSymbol from '../assets/home-buttons/staging-button-symbol.png';
import ordersButtonSymbol from '../assets/home-buttons/orders-button-symbol.png';
import storeManagementButtonSymbol from '../assets/home-buttons/store-management-button-symbol.png';
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

const isScheduledForToday = (scheduledPickupTime, now = new Date()) => {
  if (!scheduledPickupTime) {
    return false;
  }

  const scheduledDate = new Date(scheduledPickupTime);
  if (Number.isNaN(scheduledDate.getTime())) {
    return false;
  }

  return scheduledDate.toDateString() === now.toDateString();
};

const HOME_BUTTONS = [
  {
    key: 'picking',
    className: 'picking-btn',
    icon: pickingButtonSymbol,
    iconAlt: 'Picking symbol',
    title: 'Picking',
    buildStats: ({ isLoading, dashboardStats }) => ([
      `${isLoading ? '...' : dashboardStats.pickingItemsAvailable} items available`,
      `${isLoading ? '...' : formatPickRate(dashboardStats.storePickRate)} store pick rate`
    ]),
    onClick: (navigate) => navigate('/commodityselect')
  },
  {
    key: 'staging',
    className: 'staging-btn',
    icon: stagingButtonSymbol,
    iconAlt: 'Staging symbol',
    title: 'Staging',
    buildStats: ({ isLoading, dashboardStats }) => ([
      `${isLoading ? '...' : dashboardStats.totesLeftToStage} totes left to stage`
    ]),
    onClick: (navigate) => navigate('/staging')
  },
  {
    key: 'orders',
    className: 'orders-btn',
    icon: ordersButtonSymbol,
    iconAlt: 'Order fulfillment symbol',
    title: 'Order Fulfillment',
    buildStats: ({ isLoading, dashboardStats }) => ([
      `${isLoading ? '...' : dashboardStats.checkedInCars} cars checked in`,
      `${isLoading ? '...' : dashboardStats.longWaits} long waits`
    ]),
    onClick: (navigate) => navigate('/orders')
  },
  {
    key: 'inventory',
    className: 'inventory-btn',
    icon: storeManagementButtonSymbol,
    iconAlt: 'Store management symbol',
    title: 'Store Management',
    buildStats: ({ isLoading, dashboardStats }) => ([
      isLoading ? '.../... orders complete' : `${dashboardStats.completedOrders}/${dashboardStats.totalTrackableOrders} orders complete`
    ]),
    onClick: (navigate) => navigate('/inventory')
  }
];

const HomePage = () => {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(true);
  const [orders, setOrders] = useState([]);
  const [stagingAssignments, setStagingAssignments] = useState([]);
  const [storePickRate, setStorePickRate] = useState(0);

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

        const [ordersResponse, assignmentsResponse, statsResponse] = await Promise.all([
          fetch(`${API_BASE}/api/orders`, { headers }),
          fetch(`${API_BASE}/api/staging-locations/assignments`, { headers }),
          fetch(`${API_BASE}/api/employees/stats/summary`, { headers })
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

        if (statsResponse.ok) {
          const statsPayload = await statsResponse.json();
          setStorePickRate(toNumber(statsPayload?.store?.statsToday?.pickRate ?? statsPayload?.store?.stats?.pickRate));
        } else {
          setStorePickRate(0);
        }
      } catch {
        setOrders([]);
        setStagingAssignments([]);
        setStorePickRate(0);
      } finally {
        setIsLoading(false);
      }
    };

    loadHomeStats();
  }, []);

  const dashboardStats = useMemo(() => {
    const today = new Date();
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

    const todaysTrackableOrders = orders.filter((order) => {
      const normalizedStatus = String(order?.status || '').toLowerCase();
      if (normalizedStatus === 'cancelled') {
        return false;
      }

      return isScheduledForToday(order?.scheduledPickupTime, today);
    });

    const completedOrders = todaysTrackableOrders.filter((order) => String(order?.status || '').toLowerCase() === 'completed').length;

    return {
      pickingItemsAvailable,
      totesLeftToStage,
      checkedInCars,
      longWaits,
      completedOrders,
      totalTrackableOrders: todaysTrackableOrders.length,
      storePickRate
    };
  }, [orders, stagingAssignments, storePickRate]);

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
          {HOME_BUTTONS.map((button) => (
            <button
              key={button.key}
              className={`home-action-button ${button.className}`}
              onClick={() => button.onClick(navigate)}
            >
              <span className="home-card-icon-wrap" aria-hidden="true">
                <img className="home-card-icon" src={button.icon} alt={button.iconAlt} />
              </span>
              <span className="home-card-copy">
                <span className="home-card-title">{button.title}</span>
                {button.buildStats({ isLoading, dashboardStats }).map((stat) => (
                  <span key={stat} className="home-card-stat">{stat}</span>
                ))}
              </span>
            </button>
          ))}
        </div>
      </div>
      <Navbar />
    </div>
  );
};

export default HomePage;