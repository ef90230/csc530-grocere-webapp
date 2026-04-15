import React, { useEffect, useRef, useState } from 'react';
import './BarcodeScannerModal.css';

const defaultFormats = ['upc_a', 'upc_e'];

const BarcodeScannerModal = ({
  isOpen,
  title,
  description,
  instructions,
  statusMessage: statusMessageFromProps,
  onClose,
  onDetected,
  formats = defaultFormats
}) => {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const detectorRef = useRef(null);
  const scanFrameRef = useRef(null);
  const lastDetectedValueRef = useRef('');
  const isScanningRef = useRef(false);
  const [statusMessage, setStatusMessage] = useState('Preparing camera...');

  const normalizeUpc = (value = '') => String(value || '').replace(/\D/g, '');

  const stopScanner = () => {
    if (scanFrameRef.current) {
      window.cancelAnimationFrame(scanFrameRef.current);
      scanFrameRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    detectorRef.current = null;
    isScanningRef.current = false;
    lastDetectedValueRef.current = '';

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  };

  const startScanner = async () => {
    try {
      const BarcodeDetectorApi = window.BarcodeDetector;
      const mediaDevices = window.navigator?.mediaDevices;

      if (!BarcodeDetectorApi || !mediaDevices?.getUserMedia) {
        setStatusMessage('Camera unavailable on this device.');
        return;
      }

      if (typeof BarcodeDetectorApi.getSupportedFormats === 'function') {
        const supportedFormats = await BarcodeDetectorApi.getSupportedFormats();
        const hasSupportedFormat = formats.some((format) => supportedFormats.includes(format));
        if (!hasSupportedFormat) {
          setStatusMessage('Camera unavailable on this device.');
          return;
        }
      }

      setStatusMessage('Requesting camera access...');
      const stream = await mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment'
        },
        audio: false
      });

      streamRef.current = stream;
      detectorRef.current = new BarcodeDetectorApi({ formats });
      isScanningRef.current = true;
      setStatusMessage(instructions || 'Point the camera at a UPC barcode.');

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }

      const scan = async () => {
        if (!isScanningRef.current || !detectorRef.current || !videoRef.current) {
          return;
        }

        try {
          const barcodes = await detectorRef.current.detect(videoRef.current);
          if (Array.isArray(barcodes) && barcodes.length > 0) {
            const scannedValue = String(barcodes[0]?.rawValue || '').trim();
            const normalizedScanned = normalizeUpc(scannedValue);

            if (normalizedScanned && normalizedScanned !== normalizeUpc(lastDetectedValueRef.current)) {
              lastDetectedValueRef.current = scannedValue;
              onDetected?.(scannedValue);
            }
          }
        } catch (error) {
          console.error('Barcode detection failed', error);
          setStatusMessage('Camera is available, but barcode detection failed.');
        }

        scanFrameRef.current = window.requestAnimationFrame(scan);
      };

      scanFrameRef.current = window.requestAnimationFrame(scan);
    } catch (error) {
      console.error('Unable to open barcode scanner', error);
      stopScanner();
      setStatusMessage('Camera unavailable on this device.');
    }
  };

  useEffect(() => {
    if (isOpen && statusMessageFromProps) {
      setStatusMessage(statusMessageFromProps);
    }
  }, [isOpen, statusMessageFromProps]);

  useEffect(() => {
    if (!isOpen) {
      stopScanner();
      return undefined;
    }

    setStatusMessage(statusMessageFromProps || 'Preparing camera...');
    startScanner();

    return () => {
      stopScanner();
    };
  }, [formats, isOpen]);

  if (!isOpen) {
    return null;
  }

  return (
    <div className="barcode-scanner-overlay" onClick={onClose}>
      <section className="barcode-scanner-modal" onClick={(event) => event.stopPropagation()}>
        <div className="barcode-scanner-header">
          <div>
            <h3>{title || 'Scan Barcode'}</h3>
            <p>{description || 'Use the camera to scan a UPC barcode.'}</p>
          </div>
          <button type="button" className="barcode-scanner-close" onClick={onClose} aria-label="Close scanner">
            ×
          </button>
        </div>

        <div className="barcode-scanner-body">
          <p className="barcode-scanner-status">{statusMessage}</p>
          <div className="barcode-scanner-preview-wrap">
            <video ref={videoRef} className="barcode-scanner-preview" autoPlay muted playsInline />
          </div>
        </div>

        <div className="barcode-scanner-footer">
          <button type="button" className="barcode-scanner-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </section>
    </div>
  );
};

export default BarcodeScannerModal;
