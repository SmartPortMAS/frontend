import { useState, useEffect } from 'react';
import useSensorStore from '../../stores/useSensorStore';
import { FaExclamationTriangle, FaTimes } from 'react-icons/fa';

export default function ToastContainer() {
  const alerts = useSensorStore(state => state.alerts);
  const [visibleAlerts, setVisibleAlerts] = useState([]);

  useEffect(() => {
    if (alerts.length > 0) {
      const latestAlert = alerts[0];
      // Only show if it's very recent (within 5 seconds)
      if (Date.now() - latestAlert.timestamp < 5000) {
        setVisibleAlerts(prev => {
          if (!prev.find(a => a.id === latestAlert.id)) {
            return [...prev, latestAlert];
          }
          return prev;
        });
        
        // Auto remove after 5 seconds
        setTimeout(() => {
          setVisibleAlerts(prev => prev.filter(a => a.id !== latestAlert.id));
        }, 5000);
      }
    }
  }, [alerts]);

  return (
    <div className="toast-container">
      {visibleAlerts.map(alert => (
        <div key={alert.id} className={`toast toast-${alert.type || 'warning'}`}>
          <div className="toast-icon">
            <FaExclamationTriangle />
          </div>
          <div className="toast-content">
            <strong>{alert.type === 'danger' ? '긴급 경보' : '주의 알림'}</strong>
            <span>{alert.message}</span>
          </div>
          <button className="toast-close" onClick={() => setVisibleAlerts(prev => prev.filter(a => a.id !== alert.id))}>
            <FaTimes />
          </button>
        </div>
      ))}
    </div>
  );
}
