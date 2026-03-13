import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';

// Import pages
import CartScreen from './pages/CartScreen';
import CommoditySelectPage from './pages/CommoditySelectPage';
import HomePage from './pages/HomePage';
import InventoryScreen from './pages/InventoryScreen';
import LoginPage from './pages/LoginPage';
import TitlePage from './pages/TitlePage';
import StorefrontPage from './pages/StorefrontPage';
// import MapScreen from './pages/MapScreen';
import OrderListPage from './pages/OrderListPage';
import PickingPage from './pages/PickingPage';
import SignupPage from './pages/SignupPage';
import StagingPage from './pages/StagingPage';
import StatisticsPage from './pages/StatisticsPage';

// Protected route component
const ProtectedRoute = ({ children }) => {
  // TODO: Add auth check here
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
                                <ProtectedRoute>
                                    <StorefrontPage />
                                </ProtectedRoute>
                            }
                        />

                        {/* Employee protected routes */}
                        <Route
                            path="/commodityselect"
                            element={
                                <ProtectedRoute>
                                    <CommoditySelectPage />
                                </ProtectedRoute>
                            }
                        />
                        <Route
                            path="/home"
                            element={
                                <ProtectedRoute>
                                    <HomePage />
                                </ProtectedRoute>
                            }
                        />
                        <Route
                            path="/inventory"
                            element={
                                <ProtectedRoute>
                                    <InventoryScreen />
                                </ProtectedRoute>
                            }
                        />
                        <Route
                            path="/orders"
                            element={
                                <ProtectedRoute>
                                    <OrderListPage />
                                </ProtectedRoute>
                            }
                        />
                        <Route
                            path="/staging"
                            element={
                                <ProtectedRoute>
                                    <StagingPage />
                                </ProtectedRoute>
                            }
                        />
                        <Route
                            path="/stats"
                            element={
                                <ProtectedRoute>
                                    <StatisticsPage />
                                </ProtectedRoute>
                            }
                        />
                        {/* <Route
                            path="/map"
                            element={
                                <ProtectedRoute>
                                    <MapScreen />
                                </ProtectedRoute>
                            }
                        /> */}
                        <Route
                            path="/picking"
                            element={
                                <ProtectedRoute>
                                    <PickingPage />
                                </ProtectedRoute>
                            }
                        />

                        {/* Customer protected routes */}
                        <Route
                            path="/cart"
                            element={
                                <ProtectedRoute>
                                    <CartScreen />
                                </ProtectedRoute>
                            }
                        />
                    </Routes>
                </main>
            </div>
        </Router>
    );
}

export default App;