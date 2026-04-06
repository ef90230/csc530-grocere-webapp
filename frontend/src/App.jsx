import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';

// Import pages
import CartScreen from './pages/CartScreen';
import CommoditySelectPage from './pages/CommoditySelectPage';
import HomePage from './pages/HomePage';
import InventoryScreen from './pages/InventoryScreen';
import LoginPage from './pages/LoginPage';
import SchedulingScreen from './pages/SchedulingScreen';
import TitlePage from './pages/TitlePage';
import StorefrontPage from './pages/StorefrontPage';
import MapScreen from './pages/MapScreen';
import OrderListPage from './pages/OrderListPage';
import OrderSummary from './pages/OrderSummary';
import ParkingLotPage from './pages/ParkingLotPage';
import PickingPage from './pages/PickingPage';
import DispensePage from './pages/DispensePage';
import SignupPage from './pages/SignupPage';
import StagingPage from './pages/StagingPage';
import StagingLocationsPage from './pages/StagingLocationsPage';
import StatisticsPage from './pages/StatisticsPage';
import StoreSettingsPage from './pages/StoreSettingsPage';

const getAuthState = () => {
    const token = localStorage.getItem('authToken');
    const userType = localStorage.getItem('userType');

    return {
        isAuthenticated: Boolean(token),
        userType
    };
};

// Protected route component
const ProtectedRoute = ({ children, allowedRole }) => {
    const { isAuthenticated, userType } = getAuthState();

    if (!isAuthenticated) {
        return <Navigate to="/" replace />;
    }

    if (allowedRole && userType !== allowedRole) {
        if (allowedRole === 'customer') {
            return <Navigate to="/home" replace />;
        }

        if (allowedRole === 'employee') {
            return <Navigate to="/storefront" replace />;
        }
    }

    return children;
};

function App() {
    return (
        <Router>
            <div className="App">
                <main className="main-content">
                    <Routes>
                        {/* Public routes */}
                        <Route path="/" element={<TitlePage />} />
                        <Route path="/login" element={<LoginPage />} />
                        <Route path="/signup" element={<SignupPage />} />

                        {/* Customer routes */}
                        <Route
                            path="/storefront"
                            element={
                                <ProtectedRoute allowedRole="customer">
                                    <StorefrontPage />
                                </ProtectedRoute>
                            }
                        />

                        {/* Employee protected routes */}
                        <Route
                            path="/commodityselect"
                            element={
                                <ProtectedRoute allowedRole="employee">
                                    <CommoditySelectPage />
                                </ProtectedRoute>
                            }
                        />
                        <Route
                            path="/home"
                            element={
                                <ProtectedRoute allowedRole="employee">
                                    <HomePage />
                                </ProtectedRoute>
                            }
                        />
                        <Route
                            path="/inventory"
                            element={
                                <ProtectedRoute allowedRole="employee">
                                    <InventoryScreen />
                                </ProtectedRoute>
                            }
                        />
                        <Route
                            path="/orders"
                            element={
                                <ProtectedRoute allowedRole="employee">
                                    <OrderListPage />
                                </ProtectedRoute>
                            }
                        />
                        <Route
                            path="/dispense"
                            element={
                                <ProtectedRoute allowedRole="employee">
                                    <DispensePage />
                                </ProtectedRoute>
                            }
                        />
                        <Route
                            path="/parking-lot"
                            element={
                                <ProtectedRoute allowedRole="employee">
                                    <ParkingLotPage />
                                </ProtectedRoute>
                            }
                        />
                        <Route
                            path="/staging"
                            element={
                                <ProtectedRoute allowedRole="employee">
                                    <StagingPage />
                                </ProtectedRoute>
                            }
                        />
                        <Route
                            path="/staging/locations"
                            element={
                                <ProtectedRoute allowedRole="employee">
                                    <StagingLocationsPage />
                                </ProtectedRoute>
                            }
                        />
                        <Route
                            path="/stats"
                            element={
                                <ProtectedRoute allowedRole="employee">
                                    <StatisticsPage />
                                </ProtectedRoute>
                            }
                        />
                        <Route
                            path="/store-settings"
                            element={
                                <ProtectedRoute allowedRole="employee">
                                    <StoreSettingsPage />
                                </ProtectedRoute>
                            }
                        />
                        <Route
                            path="/map"
                            element={
                                <ProtectedRoute allowedRole="employee">
                                    <MapScreen />
                                </ProtectedRoute>
                            }
                        />
                        <Route
                            path="/picking"
                            element={
                                <ProtectedRoute allowedRole="employee">
                                    <PickingPage />
                                </ProtectedRoute>
                            }
                        />

                        {/* Customer protected routes */}
                        <Route
                            path="/cart"
                            element={
                                <ProtectedRoute allowedRole="customer">
                                    <CartScreen />
                                </ProtectedRoute>
                            }
                        />
                        <Route
                            path="/order-summary"
                            element={
                                <ProtectedRoute allowedRole="customer">
                                    <OrderSummary />
                                </ProtectedRoute>
                            }
                        />
                        <Route
                            path="/schedule"
                            element={
                                <ProtectedRoute allowedRole="customer">
                                    <SchedulingScreen />
                                </ProtectedRoute>
                            }
                        />

                        <Route path="*" element={<Navigate to="/" replace />} />
                    </Routes>
                </main>
            </div>
        </Router>
    );
}

export default App;