import React, { useEffect, useState } from 'react';
import './StagingLocationForm.css';

const ITEM_TYPE_OPTIONS = [
    { value: 'ambient', label: 'Ambient' },
    { value: 'chilled', label: 'Chilled' },
    { value: 'frozen', label: 'Frozen' },
    { value: 'hot', label: 'Hot' },
    { value: 'oversized', label: 'Oversized' }
];

const StagingLocationForm = ({ isOpen, onClose, onSubmit, isSubmitting = false, errorMessage = '' }) => {
    const [name, setName] = useState('');
    const [itemType, setItemType] = useState('ambient');

    useEffect(() => {
        if (!isOpen) {
            return;
        }

        setName('');
        setItemType('ambient');
    }, [isOpen]);

    if (!isOpen) {
        return null;
    }

    const handleSubmit = (event) => {
        event.preventDefault();
        onSubmit({ name, itemType });
    };

    return (
        <div className="staging-modal-backdrop" role="presentation" onClick={onClose}>
            <section
                className="staging-modal-card"
                role="dialog"
                aria-modal="true"
                aria-labelledby="staging-location-form-title"
                onClick={(event) => event.stopPropagation()}
            >
                <h2 id="staging-location-form-title">New Location</h2>

                <form className="staging-modal-form" onSubmit={handleSubmit}>
                    <label htmlFor="staging-location-name">Name</label>
                    <input
                        id="staging-location-name"
                        type="text"
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                        maxLength={60}
                        placeholder="Enter location name"
                        required
                    />

                    <label htmlFor="staging-location-type">Item Type</label>
                    <select
                        id="staging-location-type"
                        value={itemType}
                        onChange={(event) => setItemType(event.target.value)}
                    >
                        {ITEM_TYPE_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                                {option.label}
                            </option>
                        ))}
                    </select>

                    {errorMessage ? <p className="staging-modal-error">{errorMessage}</p> : null}

                    <div className="staging-modal-actions">
                        <button type="button" className="staging-modal-btn staging-modal-btn--ghost" onClick={onClose}>
                            Cancel
                        </button>
                        <button type="submit" className="staging-modal-btn staging-modal-btn--primary" disabled={isSubmitting}>
                            {isSubmitting ? 'Saving...' : 'Create'}
                        </button>
                    </div>
                </form>
            </section>
        </div>
    );
};

export default StagingLocationForm;