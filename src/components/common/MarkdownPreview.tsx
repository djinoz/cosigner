import React, { useState, useEffect } from 'react';
import markdownUtils from '../../utils/MarkdownUtils';

interface MarkdownPreviewProps {
  content: string;
}

const MarkdownPreview: React.FC<MarkdownPreviewProps> = ({ content }) => {
  const [html, setHtml] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    const renderMarkdown = async () => {
      setLoading(true);
      try {
        const renderedHtml = await markdownUtils.convertToHtml(content);
        setHtml(renderedHtml);
      } catch (error) {
        console.error('Error rendering markdown:', error);
      } finally {
        setLoading(false);
      }
    };

    renderMarkdown();
  }, [content]);

  if (loading) {
    return <div className="text-center p-3">Loading preview...</div>;
  }

  return <div dangerouslySetInnerHTML={{ __html: html }} />;
};

export default MarkdownPreview;
