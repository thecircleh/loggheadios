import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { getApiUrl } from '../utils/getApiUrl';

const BlogList = () => {
  const [posts, setPosts] = useState([]);
  const [filteredPosts, setFilteredPosts] = useState([]);
  const [selectedPostId, setSelectedPostId] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [collapsed, setCollapsed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchPosts = async () => {
      try {
        setLoading(true);
        const response = await axios.get(`${getApiUrl()}/api/blogs`);
        const data = Array.isArray(response.data) ? response.data : [];

        const sorted = data.sort(
          (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
        );

        setPosts(sorted);
        setFilteredPosts(sorted);
        setError(null);
      } catch (err) {
        console.error('Failed to fetch blog posts:', err);
        setError('Failed to load blog posts');
        setPosts([]);
        setFilteredPosts([]);
      } finally {
        setLoading(false);
      }
    };

    fetchPosts();
  }, []);

  useEffect(() => {
    const query = searchQuery.toLowerCase();
    const results = posts.filter((post) =>
      post.title.toLowerCase().includes(query)
    );
    setFilteredPosts(results);
  }, [searchQuery, posts]);

  const selectedPost = filteredPosts.find(p => p._id === selectedPostId);
  const displayPosts = selectedPostId ? [selectedPost] : filteredPosts;

  if (loading) return <div style={{ padding: '1rem' }}>Loading posts...</div>;
  if (error) return <div style={{ padding: '1rem', color: 'red' }}>{error}</div>;

  return (
    <div style={{ display: 'flex', height: '100vh', fontFamily: 'Arial, sans-serif' }}>
      {/* Left Panel */}
      <div style={{
        width: collapsed ? '40px' : '300px',
        transition: 'width 0.3s ease',
        borderRight: '1px solid #ccc',
        padding: collapsed ? '0.5rem 0.25rem' : '1rem',
        overflowY: 'auto',
        backgroundColor: '#f9f9f9'
      }}>
        <button
          onClick={() => setCollapsed(!collapsed)}
          style={{
            width: '100%',
            marginBottom: '1rem',
            padding: '6px',
            backgroundColor: '#007AFF',
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            fontWeight: 'bold',
            cursor: 'pointer'
          }}
        >
          {collapsed ? '➡️' : '⬅️'}
        </button>

        {!collapsed && (
          <>
            <h2 style={{ marginTop: 0 }}>Blog Posts</h2>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search..."
              style={{
                width: '100%',
                padding: '8px',
                marginBottom: '1rem',
                borderRadius: '6px',
                border: '1px solid #ccc'
              }}
            />
            <button
              onClick={() => setSelectedPostId(null)}
              style={{
                display: 'block',
                width: '100%',
                marginBottom: '1rem',
                padding: '10px',
                backgroundColor: selectedPostId ? '#f0f0f0' : '#007AFF',
                color: selectedPostId ? '#333' : '#fff',
                border: 'none',
                borderRadius: '6px',
                fontWeight: 'bold',
                cursor: 'pointer'
              }}
            >
              View All
            </button>
            {filteredPosts.map(post => (
              <button
                key={post._id}
                onClick={() => setSelectedPostId(post._id)}
                style={{
                  display: 'block',
                  width: '100%',
                  marginBottom: '0.5rem',
                  padding: '10px',
                  backgroundColor: post._id === selectedPostId ? '#34C759' : '#eee',
                  color: post._id === selectedPostId ? '#fff' : '#111',
                  border: 'none',
                  borderRadius: '6px',
                  textAlign: 'left',
                  cursor: 'pointer'
                }}
              >
                {post.title}
              </button>
            ))}
          </>
        )}
      </div>

      {/* Right Panel */}
      <div style={{
        flex: 1,
        padding: '1.5rem',
        overflowY: 'auto',
        transition: 'margin 0.3s ease'
      }}>
        {displayPosts.length === 0 && (
          <p>No blog posts match your search.</p>
        )}
        {displayPosts.map((post) => (
          <div key={post._id} style={{ marginBottom: '3rem' }}>
            <h2>{post.title}</h2>
            <div
              dangerouslySetInnerHTML={{ __html: post.contentHtml }}
              style={{ marginBottom: '1rem' }}
            />
            <hr />
          </div>
        ))}
      </div>
    </div>
  );
};

export default BlogList;
