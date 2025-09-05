import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import './HomePage.css';
import type { ParsedImageResponse, VideoItem } from '../type/type';
import { UserIdConst } from '../type/UserIdConst.ts';

export default function HomePage() {
  const navigate = useNavigate();
  const [error, setError] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const limit = 12;
  const [total, setTotal] = useState(0);
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [conceptText, setConceptText] = useState<string>('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [selectedLanguage, setSelectedLanguage] = useState<string>('zh-CN');
  const [selectedProvider, setSelectedProvider] = useState<string>('anthropic');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDevEnv, setIsDevEnv] = useState(false);

  useEffect(() => {
    // 检查是否为开发环境
    setIsDevEnv(localStorage.getItem('app.env') === 'dev');;
    fetch(
      import.meta.env.VITE_BACKEND_BASE_URL +
      `/api/v1/html/recommends?pageNo=${page}&pageSize=${limit}&sort_by=recent`
    )
      .then((response) => response.json())
      .then((data) => {
        if (data.code === 1 && data.ok) {
          setVideos(data.data.videos);
          setTotal(data.data.total);
        } else {
          console.error('获取推荐视频返回错误：', data);
        }
      })
      .catch((err) => {
        console.error('获取推荐视频失败:', err);
      });
  }, [page]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const handlePlayVideo = (video: VideoItem) => {
    // navigate(`/player/${video.id}`, {
    //   state: {
    //     videoUrl: video.video_url,
    //     coverUrl: video.cover_url,
    //     title: video.title,
    //   },
    // });
    //navigate(video.video_url)
    window.open(video.video_url, '_blank');
  };

  const totalPages = Math.ceil(total / limit);
  const handlePreviousPage = () => page > 1 && setPage(page - 1);
  const handleNextPage = () => page < totalPages && setPage(page + 1);

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] || null;
    if (file) {
      setSelectedFile(file);
      setError('');
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      const newPreview = URL.createObjectURL(file);
      setPreviewUrl(newPreview);
      await handleParseImage(file);
    } else {
      setSelectedFile(null);
      setPreviewUrl(null);
      setConceptText('');
    }
  };

  const handleParseImage = async (fileToParse: File) => {
    setIsLoading(true);
    setError('');
    setConceptText('');

    const formData = new FormData();
    formData.append('file', fileToParse);

    try {
      const response = await fetch(
        import.meta.env.VITE_BACKEND_BASE_URL + '/api/v1/file/parse',
        { method: 'POST', body: formData }
      );
      const result = await response.json();

      if (response.ok && result.code === 1 && result.ok && result.data) {
        const data = result.data as ParsedImageResponse;
        setConceptText(data.content);
      } else {
        throw new Error(result.msg || result.error || 'Failed to parse image.');
      }
    } catch (err: any) {
      console.error('Error parsing image:', err);
      setError(err.message || 'An unexpected error occurred during parsing.');
      setConceptText('');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLanguageChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedLanguage(e.target.value);
  };

  const handleProviderChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedProvider(e.target.value);
  };

  const handleGenerateVideo = () => {
    if (!conceptText.trim()) {
      setError('请输入主题');
      return;
    }
    setError('');
    setLoading(true);

    navigate('/player', {
      state: {
        question: conceptText,
        provider: selectedProvider,
        voice_provider: 'openai',
        voice_id: 'shimmer',
        language: selectedLanguage.startsWith('zh') ? 'zh' : 'en',
        user_id: UserIdConst.TONG_LI,
      },
    });
  };

  return (
    <div className="homepage-container">
      <h1 className="app-title">Teach Me Anything</h1>

      <div className="controls-section">
        <div className="select-group">
          <label htmlFor="language-select">语言:</label>
          <select
            id="language-select"
            value={selectedLanguage}
            onChange={handleLanguageChange}
          >
            <option value="zh-CN">简体中文</option>
            <option value="en-US">English</option>
            <option value="es-ES">Español</option>
          </select>
        </div>

        {isDevEnv && (
          <div className="select-group">
            <label htmlFor="provider-select">LLM Provider:</label>
            <select
              id="provider-select"
              value={selectedProvider}
              onChange={handleProviderChange}
            >
              <option value="anthropic">Anthropic Claude</option>
              <option value="openai">OpenAI</option>
              <option value="openrouter">OpenRouter DeepSeek</option>
              <option value="google">Google Gemini</option>
            </select>
          </div>
        )}

        <div className="upload-section">
          <input
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            ref={fileInputRef}
            style={{ display: 'none' }}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="upload-button"
          >
            {selectedFile ? '更换图片' : '上传图片'}
          </button>
          {previewUrl && (
            <div className="image-preview">
              <img src={previewUrl} alt="预览" />
            </div>
          )}
        </div>

        <button
          onClick={handleGenerateVideo}
          className="generate-button"
          disabled={isLoading || loading}
        >
          {loading ? '正在生成...' : '生成视频'}
        </button>
      </div>

      <div className="concept-input-section">
        <textarea
          placeholder="描述想要讲解的技术概念 (或上传图片自动填充)"
          value={conceptText}
          onChange={(e) => setConceptText(e.target.value)}
          rows={4}
        />
      </div>

      {isLoading && <p className="loading-message">图片解析中，请稍候...</p>}
      {error && <p className="error-message">{error}</p>}

      <div className="section-header">
        <h2>历史视频</h2>
        <div className="pagination-info">
          第 {page} 页，共 {totalPages} 页
        </div>
      </div>

      <div className="videos-grid">
        {videos.map((video) => (
          <div
            key={video.id}
            className="video-item"
            onClick={() => handlePlayVideo(video)}
          >
            <div className="video-thumbnail">
              <img
                src={video.cover_url}
                alt={video.title}
              />
              <div className="play-icon">▶</div>
            </div>
            <p className="video-title">{video.title}</p>
          </div>
        ))}
      </div>

      <div className="pagination">
        <button onClick={handlePreviousPage} disabled={page === 1}>
          上一页
        </button>
        <button onClick={handleNextPage} disabled={page === totalPages}>
          下一页
        </button>
      </div>
    </div>
  );
}