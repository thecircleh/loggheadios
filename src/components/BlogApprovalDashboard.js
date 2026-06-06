import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useAuth } from './AuthContext';

const BlogApprovalDashboard = () => {
  const { token } = useAuth();
  const [posts, setPosts] = useState([]);
  const [activeTab, setActiveTab] = useState('pending');
  const [expandedPostIds, setExpandedPostIds] = useState([]);

  const API_URL = window.location.hostname.startsWith("10.")
    ? `http://${window.location.hostname}:3000`
    : process.env.REACT_APP_API_URL || "https://api.loggerhead.app";

  useEffect(() => {
    axios
      .get(`${API_URL}/api/blogs/all`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      .then((res) => setPosts(res.data))
      .catch((err) => console.error('Error fetching posts:', err));
  }, [token, API_URL]);

  const toggleExpand = (id) => {
    setExpandedPostIds((prev) =>
      prev.includes(id) ? prev.filter((pid) => pid !== id) : [...prev, id]
    );
  };

  const approvePost = async (id) => {
    try {
      await axios.put(`${API_URL}/api/blogs/${id}/approve`, {}, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setPosts(posts.map((p) => (p._id === id ? { ...p, approved: true } : p)));
    } catch (err) {
      alert('Failed to approve post');
    }
  };

  const rejectPost = async (id) => {
    if (!window.confirm("Reject this blog post? It will be permanently removed.")) return;
    try {
      await axios.delete(`${API_URL}/api/blogs/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setPosts(posts.filter((p) => p._id !== id));
    } catch (err) {
      alert('Failed to reject post');
    }
  };

  const deletePost = async (id) => {
    if (!window.confirm("Delete this approved blog post?")) return;
    try {
      await axios.delete(`${API_URL}/api/blogs/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setPosts(posts.filter((p) => p._id !== id));
    } catch (err) {
      alert('Failed to delete post');
    }
  };

  // Helper function to create slug from title
  const createSlug = (title) => {
    return title
      .toLowerCase()
      .replace(/[^\w\s-]/g, '') // Remove special characters
      .replace(/\s+/g, '-') // Replace spaces with hyphens
      .replace(/-+/g, '-') // Replace multiple hyphens with single
      .trim();
  };

  const filteredPosts = posts.filter((post) =>
    activeTab === 'approved' ? post.approved : !post.approved
  );

  const approvedPostsCount = posts.filter(post => post.approved).length;

  return (
    <div style={{ padding: '1rem' }}>
      <h2>Blog Approval Dashboard</h2>

      <div style={{ display: 'flex', marginBottom: '1rem', alignItems: 'center', gap: '10px' }}>
        <button
          onClick={() => setActiveTab('pending')}
          style={{
            padding: '10px',
            backgroundColor: activeTab === 'pending' ? '#007AFF' : '#ccc',
            color: '#fff',
            border: 'none',
            borderRadius: '6px',
          }}
        >
          Pending Posts
        </button>
        <button
          onClick={() => setActiveTab('approved')}
          style={{
            padding: '10px',
            backgroundColor: activeTab === 'approved' ? '#34C759' : '#ccc',
            color: '#fff',
            border: 'none',
            borderRadius: '6px',
          }}
        >
          Approved Posts ({approvedPostsCount})
        </button>
      </div>

      {activeTab === 'approved' && approvedPostsCount > 0 && (
        <div style={{ 
          background: '#e8f5e8', 
          padding: '20px', 
          borderRadius: '8px', 
          marginBottom: '20px',
          border: '1px solid #c3e6c3'
        }}>
          <h3 style={{ margin: '0 0 15px 0', color: '#2d5a2d' }}>📄 Static Blog URLs for AdSense</h3>
          <p style={{ margin: '0 0 15px 0', color: '#2d5a2d' }}>
            <strong>Blog Index:</strong> <a href={`${API_URL}/api/blogs/static-index`} target="_blank" rel="noopener noreferrer" style={{ color: '#007AFF' }}>
              {API_URL}/api/blogs/static-index
            </a>
          </p>
          <p style={{ margin: '0 0 10px 0', color: '#2d5a2d' }}>
            <strong>Individual Posts:</strong>
          </p>
          <div style={{ background: 'white', padding: '15px', borderRadius: '6px', maxHeight: '200px', overflowY: 'auto' }}>
            {posts.filter(post => post.approved).map(post => {
              const slug = createSlug(post.title);
              const staticUrl = `${API_URL}/api/blogs/static/${slug}`;
              return (
                <div key={post._id} style={{ marginBottom: '8px' }}>
                  <a href={staticUrl} target="_blank" rel="noopener noreferrer" style={{ color: '#007AFF', fontSize: '14px' }}>
                    {staticUrl}
                  </a>
                  <span style={{ color: '#666', fontSize: '12px', marginLeft: '10px' }}>
                    ({post.title})
                  </span>
                </div>
              );
            })}
          </div>
          <p style={{ margin: '15px 0 0 0', color: '#2d5a2d', fontSize: '14px' }}>
            💡 <strong>These URLs are crawlable by AdSense</strong> - use the blog index URL for your AdSense application.
          </p>
        </div>
      )}

      {filteredPosts.map((post) => {
        const isExpanded = expandedPostIds.includes(post._id);
        const content = isExpanded
          ? post.contentHtml
          : post.contentHtml.slice(0, 300) + (post.contentHtml.length > 300 ? '...' : '');

        return (
          <div key={post._id} style={{ border: '1px solid #ccc', padding: '1rem', marginBottom: '1rem' }}>
            <h3>{post.title}</h3>
            {post.approved && (
              <div style={{ marginBottom: '10px' }}>
                <span style={{ 
                  background: '#e8f5e8', 
                  color: '#2d5a2d', 
                  padding: '4px 8px', 
                  borderRadius: '4px', 
                  fontSize: '12px',
                  marginRight: '10px'
                }}>
                  ✅ Live at: {API_URL}/api/blogs/static/{createSlug(post.title)}
                </span>
              </div>
            )}
            <div
              dangerouslySetInnerHTML={{ __html: content }}
              style={{ marginBottom: '0.5rem' }}
            />
            {post.contentHtml.length > 300 && (
              <button
                onClick={() => toggleExpand(post._id)}
                style={{
                  marginBottom: '1rem',
                  background: 'transparent',
                  border: 'none',
                  color: '#007AFF',
                  cursor: 'pointer',
                  fontWeight: 'bold',
                }}
              >
                {isExpanded ? 'Show Less' : 'Expand'}
              </button>
            )}
            <p><strong>Author:</strong> {post.authorId?.email || 'Unknown'}</p>
            <p><strong>Status:</strong> {post.approved ? 'Approved' : 'Pending'}</p>

            {!post.approved ? (
              <>
                <button onClick={() => approvePost(post._id)} style={{ marginRight: '8px' }}>
                  Approve
                </button>
                <button
                  onClick={() => rejectPost(post._id)}
                  style={{ backgroundColor: '#FF3B30', color: 'white', border: 'none', padding: '6px 10px' }}
                >
                  Reject
                </button>
              </>
            ) : (
              <button
                onClick={() => deletePost(post._id)}
                style={{ backgroundColor: '#aaa', color: 'white', border: 'none', padding: '6px 10px' }}
              >
                Delete
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default BlogApprovalDashboard;