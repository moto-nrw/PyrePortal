import React, { useState, useEffect } from 'react';
import { listen } from '@tauri-apps/api/event';
import { createPortal } from 'react-dom';

interface RfidScanModalProps {
  isActive: boolean;
}

interface ScanResult {
  name: string;
  is_checked_in: boolean;
}

export function RfidScanModal({ isActive }: RfidScanModalProps) {
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isActive) return;

    const cleanup: (() => void)[] = [];

    // Listen for successful scans
    listen('rfid-user-processed', async (event) => {
      try {
        setError(null);
        
        const userData = event.payload as { id: number, name: string, is_checked_in: boolean };
        console.log('RFID tag processed:', userData);
        
        setScanResult(userData);
        setShowModal(true);
        
        // Auto-hide modal after 1 second
        setTimeout(() => {
          setShowModal(false);
        }, 1000);
      } catch (err) {
        console.error('Error processing tag scan:', err);
        setError('Failed to process tag');
      }
    }).then(unlistenFn => {
      cleanup.push(unlistenFn);
    });
    
    // Listen for errors
    listen('rfid-error', (event) => {
      const errorMessage = event.payload as string;
      console.error('RFID error:', errorMessage);
      setError(errorMessage);
      
      // Auto-hide error after 3 seconds
      setTimeout(() => {
        setError(null);
      }, 3000);
    }).then(unlistenFn => {
      cleanup.push(unlistenFn);
    });
    
    return () => {
      cleanup.forEach(fn => fn());
    };
  }, [isActive]);
  
  // Render nothing when inactive or nothing to show
  if (!isActive || (!showModal && !error)) {
    return null;
  }
  
  // Render modal with portal to ensure it appears on top
  return createPortal(
    <div className="fixed inset-0 flex items-center justify-center z-50">
      {showModal && scanResult && (
        <div className="bg-white rounded-lg shadow-xl p-6 max-w-md mx-auto transform transition-all">
          <div className="flex items-center justify-center mb-4">
            <img 
              src={scanResult.is_checked_in ? "/img/checked_in.png" : "/img/checked_out.png"} 
              alt={scanResult.is_checked_in ? "Checked In" : "Checked Out"}
              className="w-16 h-16 mr-4" 
            />
            <div>
              <h3 className="text-xl font-bold">{scanResult.name}</h3>
              <p className="text-gray-600">
                {scanResult.is_checked_in ? "Successfully checked in" : "Successfully checked out"}
              </p>
            </div>
          </div>
        </div>
      )}
      
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg shadow-md p-4 max-w-md mx-auto">
          <div className="flex items-center">
            <svg className="w-6 h-6 text-red-500 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-red-700">{error}</p>
          </div>
          <button 
            className="mt-3 px-3 py-1 bg-red-100 hover:bg-red-200 text-red-800 rounded"
            onClick={() => setError(null)}
          >
            Dismiss
          </button>
        </div>
      )}
    </div>,
    document.body
  );
}