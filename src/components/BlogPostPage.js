import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import { getApiUrl } from '../utils/getApiUrl';

const BlogPostPage = () => {
  const { id } = useParams();
  const [post, setPost] = useState(null);

  useEffect(() => {
    axios.get(`${getApiUrl()}/api/blogs/${id}`).then(res => setPost(res.data));
  }, [id]);

  if (!post) return <p>Loading...</p>;

  return (
    <div style={{ padding: '2rem', maxWidth: '800px', margin: 'auto' }}>
      <h1>{post.title}</h1>
      <div dangerouslySetInnerHTML={{ __html: post.contentHtml }} />
      <p style={{ fontStyle: 'italic', marginTop: '1rem' }}>Published: {new Date(post.createdAt).toLocaleDateString()}</p>
    </div>
  );
};

export default BlogPostPage;