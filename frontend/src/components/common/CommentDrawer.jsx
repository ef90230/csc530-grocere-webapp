import React, { useState } from 'react';
import './CommentDrawer.css';

const API_BASE = process.env.NODE_ENV === 'production' ? '' : (process.env.REACT_APP_API_URL || 'http://localhost:5000');

const CommentDrawer = ({ isClosing, onClose }) => {
  const [message, setMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [isSending, setIsSending] = useState(false);

  const handleSend = async () => {
    const trimmedMessage = String(message || '').trim();
    if (!trimmedMessage) {
      setErrorMessage('Write a comment before sending.');
      return;
    }

    setIsSending(true);
    setErrorMessage('');

    try {
      const token = window.localStorage.getItem('authToken');
      const response = await fetch(`${API_BASE}/api/alerts/comments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ message: trimmedMessage })
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.success) {
        throw new Error(payload.message || 'Unable to send comment.');
      }

      setMessage('');
      onClose();
    } catch (error) {
      setErrorMessage(error.message || 'Unable to send comment.');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="popup-menu-overlay" onClick={onClose}>
      <aside
        className={`popup-menu-panel popup-comment-panel ${isClosing ? 'closing' : 'open'}`}
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          className="popup-close-button"
          aria-label="Close comment panel"
          onClick={onClose}
        >
          ×
        </button>
        <div className="popup-comment-copy">
          <h2>Send Feedback</h2>
          <p>Share a comment for admin review.</p>
        </div>
        <textarea
          className="popup-comment-input"
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          placeholder="Write your feedback here..."
          rows={8}
        />
        {errorMessage ? <p className="popup-comment-error">{errorMessage}</p> : null}
        <button
          type="button"
          className="popup-action-button popup-logout-button popup-comment-send"
          onClick={handleSend}
          disabled={isSending}
        >
          {isSending ? 'Sending...' : 'Send'}
        </button>
      </aside>
    </div>
  );
};

export default CommentDrawer;