import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import PopupMenu from './PopupMenu';
import CommentDrawer from './CommentDrawer';
import StatBar from './StatBar';
import './TopBar.css';

const CLOSE_ANIMATION_MS = 280;

const CommentIcon = () => (
  <svg
    className="topbar-comment-icon"
    viewBox="0 0 24 24"
    aria-hidden="true"
    focusable="false"
  >
    <path
      fill="currentColor"
      d="M6.5 4C4.015 4 2 6.015 2 8.5v5C2 15.985 4.015 18 6.5 18H8v3.125c0 .587.672.923 1.145.572L13.5 18H17.5c2.485 0 4.5-2.015 4.5-4.5v-5C22 6.015 19.985 4 17.5 4h-11Z"
    />
    <circle cx="8" cy="11" r="1.1" fill="#f2cf4a" />
    <circle cx="12" cy="11" r="1.1" fill="#f2cf4a" />
    <circle cx="16" cy="11" r="1.1" fill="#f2cf4a" />
  </svg>
);

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
            <CommentIcon />
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
          onMySettings={() => handleNavigate('/my-settings')}
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
