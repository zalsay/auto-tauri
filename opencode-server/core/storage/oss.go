package storage

import (
	"context"
	"fmt"
	"io"
	"time"

	"github.com/aliyun/aliyun-oss-go-sdk/oss"
	"opencode-server/core/config"
)

type OSSClient struct {
	client   *oss.Client
	bucket   *oss.Bucket
	config   *config.OSSConfig
	endpoint string
}

var ossClient *OSSClient

func InitOSS(cfg *config.OSSConfig) error {
	if !cfg.Enabled {
		return nil
	}

	client, err := oss.New(cfg.Endpoint, cfg.AccessKeyID, cfg.AccessKeySecret)
	if err != nil {
		return fmt.Errorf("failed to create OSS client: %w", err)
	}

	bucket, err := client.Bucket(cfg.Bucket)
	if err != nil {
		return fmt.Errorf("failed to get OSS bucket: %w", err)
	}

	ossClient = &OSSClient{
		client:   client,
		bucket:   bucket,
		config:   cfg,
		endpoint: cfg.Endpoint,
	}

	return nil
}

func GetOSSClient() *OSSClient {
	return ossClient
}

func (c *OSSClient) Upload(ctx context.Context, key string, reader io.Reader, size int64, contentType string) (*OSSUploadResult, error) {
	options := []oss.Option{
		oss.ContentType(contentType),
	}
	err := c.bucket.PutObject(key, reader, options...)
	if err != nil {
		return nil, fmt.Errorf("failed to upload to OSS: %w", err)
	}

	url := fmt.Sprintf("https://%s.%s/%s", c.config.Bucket, c.endpoint, key)

	return &OSSUploadResult{
		Key:  key,
		URL:  url,
		Size: size,
	}, nil
}

func (c *OSSClient) Download(ctx context.Context, key string) ([]byte, error) {
	body, err := c.bucket.GetObject(key)
	if err != nil {
		return nil, fmt.Errorf("failed to download from OSS: %w", err)
	}
	defer body.Close()

	data, err := io.ReadAll(body)
	if err != nil {
		return nil, fmt.Errorf("failed to read OSS data: %w", err)
	}

	return data, nil
}

func (c *OSSClient) SignURL(ctx context.Context, key string, expiry time.Duration) (string, error) {
	signedURL, err := c.bucket.SignURL(key, "GET", int64(expiry.Seconds()))
	if err != nil {
		return "", fmt.Errorf("failed to generate signed URL: %w", err)
	}
	return signedURL, nil
}

func (c *OSSClient) Delete(ctx context.Context, key string) error {
	err := c.bucket.DeleteObject(key)
	if err != nil {
		return fmt.Errorf("failed to delete from OSS: %w", err)
	}
	return nil
}

func (c *OSSClient) List(ctx context.Context, prefix string, maxKeys int) ([]OSSFileInfo, error) {
	options := []oss.Option{
		oss.Prefix(prefix),
		oss.MaxKeys(maxKeys),
	}
	lsRes, err := c.bucket.ListObjects(options...)
	if err != nil {
		return nil, fmt.Errorf("failed to list OSS objects: %w", err)
	}

	files := make([]OSSFileInfo, 0, len(lsRes.Objects))
	for _, obj := range lsRes.Objects {
		files = append(files, OSSFileInfo{
			Key:      obj.Key,
			Size:     obj.Size,
			Modified: obj.LastModified,
		})
	}

	return files, nil
}

type OSSUploadResult struct {
	Key  string `json:"key"`
	URL  string `json:"url"`
	Size int64  `json:"size"`
}

type OSSFileInfo struct {
	Key      string    `json:"key"`
	Size     int64     `json:"size"`
	Modified time.Time `json:"modified"`
}
