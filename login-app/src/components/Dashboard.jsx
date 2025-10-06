import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../config/api';

function Dashboard() {
  const [blockedSites, setBlockedSites] = useState([]);
  const [newSite, setNewSite] = useState('');
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const userId = localStorage.getItem('userId');
  const userEmail = localStorage.getItem('userEmail');

  useEffect(() => {
    if (!userId) {
      navigate('/login');
      return;
    }

    loadDashboardData();
  }, [userId, navigate]);

  const loadDashboardData = async () => {
    try {
      // Load blocked sites
      const sitesResponse = await fetch(api.blockedSites(userId));
      const sitesData = await sitesResponse.json();
      
      if (sitesResponse.ok) {
        setBlockedSites(sitesData.blockedSites || []);
      }

      // Load stats
      const statsResponse = await fetch(api.stats(userId));
      const statsData = await statsResponse.json();
      
      if (statsResponse.ok) {
        setStats(statsData);
      }

      setLoading(false);
    } catch (err) {
      console.error('Load error:', err);
      setError('Failed to load data');
      setLoading(false);
    }
  };

  const handleAddSite = async (e) => {
    e.preventDefault();
    setError('');

    if (!newSite.trim()) return;

    try {
      const response = await fetch(api.blockedSites(userId), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: newSite })
      });

      const data = await response.json();

      if (response.ok) {
        setBlockedSites(data.blockedSites || []);
        setNewSite('');
        
        // Notify extension to sync
        if (typeof chrome !== 'undefined' && chrome.runtime) {
          chrome.runtime.sendMessage({ type: 'SYNC_SITES' });
        }
      } else {
        setError(data.error || 'Failed to add site');
      }
    } catch (err) {
      setError('Failed to add site');
      console.error('Add site error:', err);
    }
  };

  const handleRemoveSite = async (siteId) => {
    try {
      const response = await fetch(`${api.blockedSites(userId)}/${siteId}`, {
        method: 'DELETE'
      });

      const data = await response.json();

      if (response.ok) {
        setBlockedSites(data.blockedSites || []);
        
        // Notify extension to sync
        if (typeof chrome !== 'undefined' && chrome.runtime) {
          chrome.runtime.sendMessage({ type: 'SYNC_SITES' });
        }
      }
    } catch (err) {
      console.error('Remove site error:', err);
    }
  };

  const handleLogout = () => {
    localStorage.clear();
    
    // Notify extension
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      chrome.runtime.sendMessage({ type: 'USER_LOGGED_OUT' });
    }
    
    navigate('/login');
  };

  if (loading) {
    return (
      <div style={styles.loadingContainer}>
        <div style={styles.spinner}></div>
        <p>Loading dashboard...</p>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>Digital Detox Dashboard</h1>
        <div style={styles.userInfo}>
          <span style={styles.userEmail}>{userEmail}</span>
          <button onClick={handleLogout} style={styles.logoutBtn}>
            Logout
          </button>
        </div>
      </div>

      <div style={styles.content}>
        {/* Stats Section */}
        {stats && (
          <div style={styles.statsGrid}>
            <div style={styles.statCard}>
              <div style={styles.statValue}>{stats.blockedSitesCount || 0}</div>
              <div style={styles.statLabel}>Blocked Sites</div>
            </div>
            <div style={styles.statCard}>
              <div style={styles.statValue}>{stats.totalSessions || 0}</div>
              <div style={styles.statLabel}>Total Sessions</div>
            </div>
            <div style={styles.statCard}>
              <div style={styles.statValue}>
                {Math.round((stats.totalDuration || 0) / 60000)}m
              </div>
              <div style={styles.statLabel}>Total Focus Time</div>
            </div>
          </div>
        )}

        {/* Add Site Section */}
        <div style={styles.card}>
          <h2 style={styles.cardTitle}>Add Blocked Site</h2>
          <form onSubmit={handleAddSite} style={styles.addForm}>
            {error && <div style={styles.error}>{error}</div>}
            <input
              type="text"
              value={newSite}
              onChange={(e) => setNewSite(e.target.value)}
              placeholder="example.com"
              style={styles.input}
            />
            <button type="submit" style={styles.addBtn}>
              Add Site
            </button>
          </form>
        </div>

        {/* Blocked Sites List */}
        <div style={styles.card}>
          <h2 style={styles.cardTitle}>Blocked Sites ({blockedSites.length})</h2>
          {blockedSites.length === 0 ? (
            <p style={styles.emptyText}>No sites blocked yet. Add one above!</p>
          ) : (
            <ul style={styles.sitesList}>
              {blockedSites.map((site) => (
                <li key={site._id} style={styles.siteItem}>
                  <div style={styles.siteInfo}>
                    <span style={styles.siteUrl}>{site.url}</span>
                    <span style={styles.siteDate}>
                      Added {new Date(site.addedAt).toLocaleDateString()}
                    </span>
                  </div>
                  <button
                    onClick={() => handleRemoveSite(site._id)}
                    style={styles.removeBtn}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

const styles = {
  container: {
    minHeight: '100vh',
    background: '#f5f5f5',
    padding: '20px'
  },
  loadingContainer: {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '20px'
  },
  spinner: {
    width: '40px',
    height: '40px',
    border: '4px solid #f3f3f3',
    borderTop: '4px solid #667eea',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite'
  },
  header: {
    background: 'white',
    padding: '20px',
    borderRadius: '12px',
    marginBottom: '20px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
  },
  title: {
    fontSize: '24px',
    fontWeight: 'bold',
    color: '#333',
    margin: 0
  },
  userInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: '15px'
  },
  userEmail: {
    color: '#666',
    fontSize: '14px'
  },
  logoutBtn: {
    padding: '8px 16px',
    background: '#dc3545',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '14px'
  },
  content: {
    maxWidth: '900px',
    margin: '0 auto',
    display: 'flex',
    flexDirection: 'column',
    gap: '20px'
  },
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: '20px'
  },
  statCard: {
    background: 'white',
    padding: '24px',
    borderRadius: '12px',
    textAlign: 'center',
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
  },
  statValue: {
    fontSize: '36px',
    fontWeight: 'bold',
    color: '#667eea',
    marginBottom: '8px'
  },
  statLabel: {
    fontSize: '14px',
    color: '#666'
  },
  card: {
    background: 'white',
    padding: '24px',
    borderRadius: '12px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
  },
  cardTitle: {
    fontSize: '20px',
    fontWeight: 'bold',
    color: '#333',
    marginBottom: '20px'
  },
  addForm: {
    display: 'flex',
    gap: '10px'
  },
  error: {
    background: '#fee',
    color: '#c33',
    padding: '12px',
    borderRadius: '6px',
    fontSize: '14px',
    marginBottom: '10px'
  },
  input: {
    flex: 1,
    padding: '12px',
    border: '1px solid #ddd',
    borderRadius: '6px',
    fontSize: '16px'
  },
  addBtn: {
    padding: '12px 24px',
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontWeight: '600'
  },
  emptyText: {
    textAlign: 'center',
    color: '#999',
    padding: '40px 0'
  },
  sitesList: {
    listStyle: 'none',
    padding: 0,
    margin: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '10px'
  },
  siteItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '16px',
    background: '#f9f9f9',
    borderRadius: '8px',
    border: '1px solid #eee'
  },
  siteInfo: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px'
  },
  siteUrl: {
    fontSize: '16px',
    fontWeight: '600',
    color: '#333'
  },
  siteDate: {
    fontSize: '12px',
    color: '#999'
  },
  removeBtn: {
    padding: '8px 16px',
    background: '#dc3545',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '14px'
  }
};

export default Dashboard;