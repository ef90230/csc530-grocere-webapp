import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../components/common/Navbar';
import TopBar from '../components/common/TopBar';
import './LeaderboardPage.css';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:5000';

const SORT_OPTIONS = [
  { key: 'pickRate', label: 'Pick rate' },
  { key: 'firstTimePickPercent', label: 'FTPR' },
  { key: 'itemsPicked', label: 'Items picked' },
  { key: 'weightedEfficiency', label: 'Efficiency score' }
];

const toNumber = (value) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
};

const formatValue = (key, value) => {
  const safeValue = toNumber(value);
  
  if (key === 'pickRate') {
    return safeValue.toFixed(2);
  }
  
  if (key === 'firstTimePickPercent' || key === 'weightedEfficiency') {
    return `${safeValue.toFixed(1)}%`;
  }
  
  if (key === 'itemsPicked') {
    return Math.round(safeValue).toLocaleString();
  }
  
  return safeValue.toFixed(1);
};

const getLastInitial = (lastName) => {
  return lastName && lastName.length > 0 ? lastName.charAt(0).toUpperCase() : '';
};

const LeaderboardPage = () => {
  const navigate = useNavigate();
  const [leaderboard, setLeaderboard] = useState([]);
  const [sortBy, setSortBy] = useState('pickRate');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const token = localStorage.getItem('authToken');
    if (!token) {
      setError('Unable to load leaderboard without an active session.');
      setIsLoading(false);
      return;
    }

    const controller = new AbortController();

    const loadLeaderboard = async () => {
      try {
        const response = await fetch(`${API_BASE}/api/employees/stats/leaderboard`, {
          headers: {
            Authorization: `Bearer ${token}`
          },
          signal: controller.signal
        });

        const payload = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(payload?.message || 'Failed to load leaderboard.');
        }

        setLeaderboard(payload.leaderboard || []);
        setError('');
      } catch (fetchError) {
        if (fetchError.name === 'AbortError') {
          return;
        }
        setError(fetchError.message || 'Failed to load leaderboard.');
      } finally {
        setIsLoading(false);
      }
    };

    loadLeaderboard();

    return () => controller.abort();
  }, []);

  // Sort leaderboard based on selected metric
  const sortedLeaderboard = useMemo(() => {
    const sorted = [...leaderboard].sort((a, b) => {
      const aValue = toNumber(a[sortBy]);
      const bValue = toNumber(b[sortBy]);
      
      // For sort metrics, higher is better (descending order)
      return bValue - aValue;
    });
    
    return sorted;
  }, [leaderboard, sortBy]);

  // Add ranks to sorted leaderboard
  const rankedLeaderboard = sortedLeaderboard.map((employee, index) => ({
    ...employee,
    rank: index + 1
  }));

  return (
    <div className="leaderboard-page">
      <TopBar
        title="Leaderboard"
        leftActionLabel="<"
        onLeftAction={() => navigate(-1)}
      />
      
      <div className="leaderboard-content">
        {isLoading && <p className="leaderboard-message">Loading leaderboard...</p>}
        {!isLoading && error && <p className="leaderboard-message leaderboard-message--error">{error}</p>}
        
        {!isLoading && !error && (
          <>
            {/* Sort Dropdown */}
            <div className="leaderboard-controls">
              <label htmlFor="sort-dropdown" className="leaderboard-label">Sort by:</label>
              <select
                id="sort-dropdown"
                className="leaderboard-dropdown"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
              >
                {SORT_OPTIONS.map((option) => (
                  <option key={option.key} value={option.key}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Leaderboard Table */}
            <div className="leaderboard-table-wrapper">
              <table className="leaderboard-table">
                <thead>
                  <tr>
                    <th>Rank</th>
                    <th>Name</th>
                    <th>Pick rate</th>
                    <th>FTPR</th>
                    <th>Items picked</th>
                    <th>Efficiency</th>
                  </tr>
                </thead>
                <tbody>
                  {rankedLeaderboard.length > 0 ? (
                    rankedLeaderboard.map((employee) => (
                      <tr key={employee.id}>
                        <td className="leaderboard-rank">
                          {employee.rank === 1 ? '🥇' : employee.rank === 2 ? '🥈' : employee.rank === 3 ? '🥉' : employee.rank}
                        </td>
                        <td className="leaderboard-name">
                          {employee.firstName} {getLastInitial(employee.lastName)}.
                        </td>
                        <td>{formatValue('pickRate', employee.pickRate)}</td>
                        <td>{formatValue('firstTimePickPercent', employee.firstTimePickPercent)}</td>
                        <td>{formatValue('itemsPicked', employee.itemsPicked)}</td>
                        <td>{formatValue('weightedEfficiency', employee.weightedEfficiency)}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="6" className="leaderboard-empty">No employees found</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      <Navbar />
    </div>
  );
};

export default LeaderboardPage;
