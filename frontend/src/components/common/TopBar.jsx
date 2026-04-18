import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import PopupMenu from './PopupMenu';
import CommentDrawer from './CommentDrawer';
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
  extraActionLabel,
  extraActionAriaLabel = 'Top bar extra action',
  onExtraAction,
  isExtraActionMenuOpen = false,
  extraActionMenu,
  statMode = 'default',
  walkCompletedUnits = 0,
  walkTotalUnits = 0,
  walkStartedAt
}) => {
  const navigate = useNavigate();
  const [isMenuVisible, setIsMenuVisible] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [isCommentVisible, setIsCommentVisible] = useState(false);
  const [isCommentClosing, setIsCommentClosing] = useState(false);
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

  useEffect(() => {
    if (!isCommentClosing) {
      return undefined;
    }

    const timeoutId = setTimeout(() => {
      setIsCommentVisible(false);
      setIsCommentClosing(false);
    }, CLOSE_ANIMATION_MS);

    return () => clearTimeout(timeoutId);
  }, [isCommentClosing]);

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

  const openCommentDrawer = () => {
    setIsCommentClosing(false);
    setIsCommentVisible(true);
  };

  const closeCommentDrawer = () => {
    if (!isCommentVisible) {
      return;
    }
    setIsCommentClosing(true);
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
        {onExtraAction ? (
          <div className="topbar-extra-action-wrap">
            <button
              type="button"
              className="topbar-extra-action-button"
              aria-label={extraActionAriaLabel}
              onClick={onExtraAction}
            >
              {extraActionLabel || '⋮'}
            </button>
            {isExtraActionMenuOpen && extraActionMenu ? (
              <div className="topbar-extra-action-menu">
                {extraActionMenu}
              </div>
            ) : null}
          </div>
        ) : null}
        {isEmployee ? (
          <button
            type="button"
            className="topbar-comment-button"
            aria-label="Open feedback"
            onClick={openCommentDrawer}
          >
            💬
          </button>
        ) : null}
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
          onCommentsAndAlerts={() => handleNavigate('/alerts')}
          onMyStats={() => handleNavigate('/stats')}
          onMySettings={() => handleNavigate('/employee-settings')}
          onStoreSettings={() => handleNavigate('/store-settings')}
          onLogout={handleLogout}
          showBackroomLocations={isEmployee}
          showParkingLot={isEmployee}
          showCommentsAndAlerts={isAdmin}
          showMySettings={isEmployee}
          showStoreSettings={isAdmin}
        />
      )}
      {(isCommentVisible || isCommentClosing) && isEmployee ? (
        <CommentDrawer
          isClosing={isCommentClosing}
          onClose={closeCommentDrawer}
        />
      ) : null}
    </>
  );
};

export default TopBar;
