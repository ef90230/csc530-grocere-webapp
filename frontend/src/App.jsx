import {} from 'react';

// Import pages
import CartScreen from './pages/CartScreen';
import CommoditySelectPage from './pages/CommoditySelectPage';
import HomePage from './pages/HomePage';
import InventoryScreen from './pages/InventoryScreen';
import LoginPage from './pages/LoginPage';
import MapScreen from './pages/MapScreen';
import OrderListPage from './pages/OrderListPage';
import PickingPage from './pages/PickingPage';
import SignupPage from './pages/SignupPage';
import StagingPage from './pages/StagingPage';
import StatisticsPage from './pages/StatisticsPage';

function App() {
    return (
        <ThemeProvider>
            <AuthProvider>
                <Router>
                    <div className="App">
                        <main className="main-content">
                            {/* Public routes */}
                            <Route
                                path="/login"
                                element={<LoginPage />}/>
                            <Route
                                path="/signup"
                                element={<SignupPage />}/>
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
                            {/* Customer protected routes */}
                            <Route
                                path="/cart"
                                element={
                                    <ProtectedRoute>
                                        <CartScreen />
                                    </ProtectedRoute>
                                }
                            />
                        </main>
                    </div>
                </Router>
            </AuthProvider>
        </ThemeProvider>
    );
}

export default App;