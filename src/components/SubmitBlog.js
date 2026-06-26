import React, { useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import CodeBlock from '@tiptap/extension-code-block';
import Youtube from '@tiptap/extension-youtube';
import axios from 'axios';
import { useAuth } from './AuthContext';

const getApiUrl = () => {
  const h = window.location.hostname;
  if (!window.Capacitor?.isNativePlatform?.() && (h === 'localhost' || h === '127.0.0.1' || h.startsWith('10.'))) {
    return `http://${h}:3000`;
  }
  return process.env.REACT_APP_API_URL || "https://api.loggerhead.app";
};

const API_URL = getApiUrl(); 

const SubmitBlog = () => {
  const { token } = useAuth();
  const [title, setTitle] = useState('');
  const [embedUrl, setEmbedUrl] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [notification, setNotification] = useState(null);
  const [dragActive, setDragActive] = useState(false);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      Image.configure({
        inline: true,
        allowBase64: true,
        HTMLAttributes: {
          class: 'blog-image',
        },
      }),
      Link.configure({ openOnClick: false }),
      CodeBlock,
      Youtube.configure({ width: 640, height: 360 }),
    ],
    content: '',
    editable: true,
  });

  const showNotification = (message, type = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 4000);
  };

  const handleImageUpload = async (file) => {
    if (!file || !file.type.startsWith('image/')) {
      showNotification('Please select a valid image file.', 'error');
      return;
    }

    // Check file size (limit to 5MB)
    if (file.size > 5 * 1024 * 1024) {
      showNotification('Image size must be less than 5MB.', 'error');
      return;
    }

    try {
      // Convert to base64 for preview (in a real app, you'd upload to a server)
      const reader = new FileReader();
      reader.onload = (e) => {
        const imageUrl = e.target.result;
        editor.chain().focus().setImage({ src: imageUrl }).run();
        showNotification('Image added successfully!');
      };
      reader.readAsDataURL(file);
    } catch (error) {
      showNotification('Failed to add image. Please try again.', 'error');
    }
  };

  const handleFileInput = (e) => {
    const file = e.target.files[0];
    if (file) {
      handleImageUpload(file);
    }
    // Reset input so same file can be selected again
    e.target.value = '';
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    const files = e.dataTransfer.files;
    if (files && files[0]) {
      handleImageUpload(files[0]);
    }
  };

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const insertYoutube = () => {
    if (!embedUrl.trim()) return;
    
    try {
      editor.chain().focus().setYoutubeVideo({ src: embedUrl }).run();
      setEmbedUrl('');
      showNotification('YouTube video embedded successfully!');
    } catch (error) {
      showNotification('Failed to embed YouTube video. Please check the URL.', 'error');
    }
  };

  const handleSubmit = async () => {
    if (!title.trim()) {
      showNotification('Please enter a title for your blog post.', 'error');
      return;
    }
    
    if (!editor || !editor.getText().trim()) {
      showNotification('Please add some content to your blog post.', 'error');
      return;
    }

    setIsSubmitting(true);
    
    try {
      const contentHtml = editor.getHTML();
      console.log("Posting blog to:", `${API_URL}/api/blogs`);
      
      await axios.post(`${API_URL}/api/blogs`, { title, contentHtml }, {
        headers: { Authorization: `Bearer ${token}` },
      });
      
      showNotification('Blog submitted successfully! It will be reviewed shortly.');
      setTitle('');
      editor.commands.clearContent();
    } catch (error) {
      showNotification('Failed to submit blog post. Please try again.', 'error');
      console.error('Submission error:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const toolbarButtons = [
    { icon: '𝐁', action: () => editor.chain().focus().toggleBold().run(), tooltip: 'Bold', isActive: () => editor.isActive('bold') },
    { icon: '𝐼', action: () => editor.chain().focus().toggleItalic().run(), tooltip: 'Italic', isActive: () => editor.isActive('italic') },
    { icon: '𝐔', action: () => editor.chain().focus().toggleUnderline().run(), tooltip: 'Underline', isActive: () => editor.isActive('underline') },
    { icon: '𝐒', action: () => editor.chain().focus().toggleStrike().run(), tooltip: 'Strikethrough', isActive: () => editor.isActive('strike') },
    { icon: 'H₁', action: () => editor.chain().focus().toggleHeading({ level: 1 }).run(), tooltip: 'Heading 1', isActive: () => editor.isActive('heading', { level: 1 }) },
    { icon: 'H₂', action: () => editor.chain().focus().toggleHeading({ level: 2 }).run(), tooltip: 'Heading 2', isActive: () => editor.isActive('heading', { level: 2 }) },
    { icon: '•', action: () => editor.chain().focus().toggleBulletList().run(), tooltip: 'Bullet List', isActive: () => editor.isActive('bulletList') },
    { icon: '1.', action: () => editor.chain().focus().toggleOrderedList().run(), tooltip: 'Numbered List', isActive: () => editor.isActive('orderedList') },
    { icon: '❝', action: () => editor.chain().focus().toggleBlockquote().run(), tooltip: 'Quote', isActive: () => editor.isActive('blockquote') },
    { icon: '</>', action: () => editor.chain().focus().toggleCodeBlock().run(), tooltip: 'Code Block', isActive: () => editor.isActive('codeBlock') },
    { icon: '🖼️', action: () => document.getElementById('image-upload').click(), tooltip: 'Add Image' },
    { icon: '↶', action: () => editor.chain().focus().undo().run(), tooltip: 'Undo' },
    { icon: '↷', action: () => editor.chain().focus().redo().run(), tooltip: 'Redo' },
  ];

  return (
    <div style={styles.container}>
      {notification && (
        <div style={{
          ...styles.notification,
          backgroundColor: notification.type === 'error' ? '#fee2e2' : '#dcfce7',
          borderColor: notification.type === 'error' ? '#fca5a5' : '#86efac',
          color: notification.type === 'error' ? '#dc2626' : '#16a34a'
        }}>
          {notification.message}
        </div>
      )}

      <div style={styles.header}>
        <h1 style={styles.title}>Create New Blog Post</h1>
        <p style={styles.subtitle}>Share your thoughts with the community</p>
      </div>

      <div style={styles.form}>
        <div style={styles.inputGroup}>
          <label style={styles.label}>Title</label>
          <input
            type="text"
            placeholder="Enter your blog post title..."
            value={title}
            onChange={e => setTitle(e.target.value)}
            style={styles.titleInput}
          />
        </div>

        <div style={styles.inputGroup}>
          <label style={styles.label}>Content</label>
          
          {editor && (
            <div style={styles.toolbar}>
              {toolbarButtons.map((button, index) => (
                <button
                  key={index}
                  onClick={button.action}
                  title={button.tooltip}
                  style={{
                    ...styles.toolbarButton,
                    ...(button.isActive && button.isActive() ? styles.toolbarButtonActive : {})
                  }}
                >
                  {button.icon}
                </button>
              ))}
            </div>
          )}

          <EditorContent 
            editor={editor} 
            style={{
              ...styles.editor,
              ...(dragActive ? styles.editorDragActive : {})
            }}
            onDrop={handleDrop}
            onDragOver={handleDrag}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
          />
          
          {dragActive && (
            <div style={styles.dropOverlay}>
              <div style={styles.dropMessage}>
                📁 Drop your image here
              </div>
            </div>
          )}

          <input
            id="image-upload"
            type="file"
            accept="image/*"
            onChange={handleFileInput}
            style={{ display: 'none' }}
          />
        </div>

        <div style={styles.inputGroup}>
          <label style={styles.label}>Add Media</label>
          
          <div style={styles.mediaSection}>
            <div style={styles.imageUploadSection}>
              <p style={styles.sectionTitle}>📷 Images</p>
              <p style={styles.sectionDescription}>Click the 🖼️ button in the toolbar above, or drag & drop images directly into the editor</p>
              <button 
                onClick={() => document.getElementById('image-upload').click()}
                style={styles.mediaButton}
              >
                📁 Choose Image File
              </button>
            </div>
            
            <div style={styles.divider}></div>
            
            <div style={styles.youtubeSection}>
              <p style={styles.sectionTitle}>🎥 YouTube Videos</p>
              <div style={styles.embedContainer}>
                <input
                  type="text"
                  placeholder="Paste YouTube URL..."
                  value={embedUrl}
                  onChange={e => setEmbedUrl(e.target.value)}
                  style={styles.embedInput}
                />
                <button 
                  onClick={insertYoutube}
                  style={styles.embedButton}
                  disabled={!embedUrl.trim()}
                >
                  Embed Video
                </button>
              </div>
            </div>
          </div>
        </div>

        <div style={styles.actions}>
          <button 
            onClick={handleSubmit} 
            disabled={isSubmitting || !title.trim()}
            style={{
              ...styles.submitButton,
              ...(isSubmitting || !title.trim() ? styles.submitButtonDisabled : {})
            }}
          >
            {isSubmitting ? (
              <>
                <span style={styles.spinner}></span>
                Submitting...
              </>
            ) : (
              'Submit for Review'
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

const styles = {
  container: {
    minHeight: '100vh',
    backgroundColor: '#f8fafc',
    padding: '2rem 1rem',
  },
  
  notification: {
    padding: '1rem',
    borderRadius: '8px',
    border: '1px solid',
    marginBottom: '1.5rem',
    fontSize: '14px',
    fontWeight: '500',
    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
  },

  header: {
    textAlign: 'center',
    marginBottom: '3rem',
  },

  title: {
    fontSize: '2.5rem',
    fontWeight: '700',
    color: '#1f2937',
    margin: '0 0 0.5rem 0',
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    backgroundClip: 'text',
  },

  subtitle: {
    fontSize: '1.1rem',
    color: '#6b7280',
    margin: 0,
    fontWeight: '400',
  },

  form: {
    maxWidth: '800px',
    margin: '0 auto',
    backgroundColor: 'white',
    borderRadius: '16px',
    padding: '2.5rem',
    boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
    border: '1px solid #e5e7eb',
  },

  inputGroup: {
    marginBottom: '2rem',
  },

  label: {
    display: 'block',
    fontSize: '0.95rem',
    fontWeight: '600',
    color: '#374151',
    marginBottom: '0.5rem',
  },

  titleInput: {
    width: '100%',
    padding: '0.875rem 1rem',
    fontSize: '1.1rem',
    border: '2px solid #e5e7eb',
    borderRadius: '12px',
    transition: 'all 0.2s ease',
    backgroundColor: '#ffffff',
    fontFamily: 'inherit',
    outline: 'none',
    boxSizing: 'border-box',
  },

  toolbar: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '0.5rem',
    padding: '1rem',
    backgroundColor: '#f9fafb',
    borderRadius: '12px 12px 0 0',
    borderBottom: '1px solid #e5e7eb',
  },

  toolbarButton: {
    padding: '0.5rem 0.75rem',
    fontSize: '0.875rem',
    fontWeight: '600',
    backgroundColor: 'white',
    border: '1px solid #d1d5db',
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    color: '#374151',
    minWidth: '2.5rem',
    height: '2.5rem',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },

  toolbarButtonActive: {
    backgroundColor: '#3b82f6',
    borderColor: '#3b82f6',
    color: 'white',
  },

  editor: {
    border: '2px solid #e5e7eb',
    borderRadius: '0 0 12px 12px',
    minHeight: '300px',
    backgroundColor: 'white',
    transition: 'border-color 0.2s ease',
    position: 'relative',
  },

  editorDragActive: {
    borderColor: '#3b82f6',
    backgroundColor: '#eff6ff',
  },

  dropOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    borderRadius: '0 0 12px 12px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    pointerEvents: 'none',
    zIndex: 10,
  },

  dropMessage: {
    fontSize: '1.1rem',
    fontWeight: '600',
    color: '#3b82f6',
    backgroundColor: 'white',
    padding: '1rem 2rem',
    borderRadius: '12px',
    border: '2px dashed #3b82f6',
  },

  mediaSection: {
    backgroundColor: '#f9fafb',
    border: '2px solid #e5e7eb',
    borderRadius: '12px',
    padding: '1.5rem',
  },

  imageUploadSection: {
    marginBottom: '1.5rem',
  },

  youtubeSection: {
    marginTop: '1.5rem',
  },

  sectionTitle: {
    fontSize: '1rem',
    fontWeight: '600',
    color: '#374151',
    margin: '0 0 0.5rem 0',
  },

  sectionDescription: {
    fontSize: '0.875rem',
    color: '#6b7280',
    margin: '0 0 1rem 0',
    lineHeight: '1.4',
  },

  divider: {
    height: '1px',
    backgroundColor: '#e5e7eb',
    margin: '1.5rem 0',
  },

  mediaButton: {
    padding: '0.75rem 1.5rem',
    fontSize: '0.95rem',
    fontWeight: '600',
    backgroundColor: '#3b82f6',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },

  embedContainer: {
    display: 'flex',
    gap: '0.75rem',
    alignItems: 'stretch',
  },

  embedInput: {
    flex: 1,
    padding: '0.875rem 1rem',
    fontSize: '0.95rem',
    border: '2px solid #e5e7eb',
    borderRadius: '12px',
    transition: 'all 0.2s ease',
    backgroundColor: '#ffffff',
    outline: 'none',
  },

  embedButton: {
    padding: '0.875rem 1.5rem',
    fontSize: '0.95rem',
    fontWeight: '600',
    backgroundColor: '#6366f1',
    color: 'white',
    border: 'none',
    borderRadius: '12px',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    whiteSpace: 'nowrap',
  },

  actions: {
    display: 'flex',
    justifyContent: 'flex-end',
    marginTop: '2.5rem',
  },

  submitButton: {
    padding: '0.875rem 2rem',
    fontSize: '1rem',
    fontWeight: '600',
    backgroundColor: '#059669',
    color: 'white',
    border: 'none',
    borderRadius: '12px',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
  },

  submitButtonDisabled: {
    backgroundColor: '#9ca3af',
    cursor: 'not-allowed',
    boxShadow: 'none',
  },

  spinner: {
    width: '1rem',
    height: '1rem',
    border: '2px solid #ffffff30',
    borderTop: '2px solid white',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
  },
};

// Add CSS animation for spinner
const styleSheet = document.createElement("style");
styleSheet.type = "text/css";
styleSheet.innerText = `
  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
  
  input:focus, .ProseMirror:focus {
    border-color: #3b82f6 !important;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1) !important;
  }
  
  button:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: 0 8px 15px -3px rgba(0, 0, 0, 0.1) !important;
  }
  
  .ProseMirror {
    padding: 1.5rem !important;
    outline: none !important;
    font-size: 1rem;
    line-height: 1.6;
    color: #374151;
  }
  
  .ProseMirror h1 {
    font-size: 1.875rem;
    font-weight: 700;
    margin: 1.5rem 0 1rem 0;
  }
  
  .ProseMirror h2 {
    font-size: 1.5rem;
    font-weight: 600;
    margin: 1.25rem 0 0.75rem 0;
  }
  
  .ProseMirror blockquote {
    border-left: 4px solid #3b82f6;
    padding-left: 1rem;
    margin: 1rem 0;
    font-style: italic;
    color: #6b7280;
  }
  
  .ProseMirror code {
    background-color: #f3f4f6;
    padding: 0.125rem 0.25rem;
    border-radius: 0.25rem;
    font-family: 'Monaco', 'Menlo', monospace;
    font-size: 0.875rem;
  }
  
  .ProseMirror pre {
    background-color: #1f2937;
    color: #f9fafb;
    padding: 1rem;
    border-radius: 0.5rem;
    overflow-x: auto;
    margin: 1rem 0;
  }
  
  .ProseMirror ul, .ProseMirror ol {
    padding-left: 1.5rem;
    margin: 1rem 0;
  }
  
  .ProseMirror li {
    margin: 0.25rem 0;
  }
  
  .blog-image {
    max-width: 100%;
    height: auto;
    border-radius: 0.5rem;
    margin: 1rem 0;
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
    cursor: pointer;
  }
  
  .blog-image:hover {
    box-shadow: 0 8px 15px -3px rgba(0, 0, 0, 0.2);
    transform: scale(1.02);
    transition: all 0.2s ease;
  }
`;
document.head.appendChild(styleSheet);

export default SubmitBlog;