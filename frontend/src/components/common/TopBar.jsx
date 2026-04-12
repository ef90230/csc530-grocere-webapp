import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import PopupMenu from './PopupMenu';
import StatBar from './StatBar';
import './TopBar.css';

const CLOSE_ANIMATION_MS = 280;

const TopBar = ({
  userName,
  pickRate,
  title = 'Welcome',
  theme = 'default',
  leftActionLabel,
  leftActionAriaLabel = 'Top bar action',
  onLeftAction,
  statMode = 'default',
  walkCompletedUnits = 0,
  walkTotalUnits = 0,
  walkStartedAt
}) => {
  const navigate = useNavigate();
  const [isMenuVisible, setIsMenuVisible] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const storedUserType = window.localStorage.getItem('userType');
  const isEmployee = storedUserType === 'employee' || storedUserType === 'admin';
  const isAdmin = storedUserType === 'admin';

  useEffect(() => {
    if (!isClosing) {
      return undefined;
    }

    const timeoutId = setTimeout(() => {
      setIsMenuVisible(false);
      setIsClosing(false);
    }, CLOSE_ANIMATION_MS);

    return () => clearTimeout(timeoutId);
  }, [isClosing]);

  const openMenu = () => {
    setIsClosing(false);
    setIsMenuVisible(true);
  };

  const closeMenu = () => {
    if (!isMenuVisible) {
      return;
    }
    setIsClosing(true);
  };

  const handleLogout = () => {
    localStorage.removeItem('authToken');
    localStorage.removeItem('userType');
    localStorage.removeItem('userDisplayName');
    localStorage.removeItem('employeeUserId');
    closeMenu();
    navigate('/');
  };

  const handleNavigate = (path) => {
    if (!isMenuVisible) {
      navigate(path);
      return;
    }

    setIsClosing(true);
    setTimeout(() => {
      navigate(path);
    }, CLOSE_ANIMATION_MS);
  };

  return (
    <>
      <header className={`topbar topbar--${theme}`}>
        {onLeftAction ? (
          <button
            type="button"
            className="topbar-left-button"
            aria-label={leftActionAriaLabel}
            onClick={onLeftAction}
          >
            {leftActionLabel || '×'}
          </button>
        ) : null}
        <span className="topbar-title">{title}</span>
        <button
          type="button"
          className="topbar-menu-button"
          aria-label="Open menu"
          onClick={openMenu}
        >
          ☰
        </button>
      </header>
      <div className="topbar-spacer" />
      <StatBar
        userName={userName}
        pickRate={pickRate}
        mode={statMode}
        walkCompletedUnits={walkCompletedUnits}
        walkTotalUnits={walkTotalUnits}
        walkStartedAt={walkStartedAt}
      />
      {(isMenuVisible || isClosing) && (
        <PopupMenu
          isClosing={isClosing}
          onClose={closeMenu}
          onBackroomLocations={() => handleNavigate('/staging/locations')}
          onInventory={() => handleNavigate('/inventory')}
          onStoreMap={() => handleNavigate('/map')}
          onParkingLot={() => handleNavigate('/parking-lot')}
          onMyStats={() => handleNavigate('/stats')}
          onMySettings={() => handleNavigate('/employee-settings')}
          onStoreSettings={() => handleNavigate('/store-settings')}
          onLogout={handleLogout}
          showBackroomLocations={isEmployee}
          showParkingLot={isEmployee}
          showMySettings={isEmployee}
          showStoreSettings={isAdmin}
        />
      )}
    </>
  );
};

export default TopBar;
