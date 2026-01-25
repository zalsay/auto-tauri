package main

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/redis/go-redis/v9"
)

var ctx = context.Background()

// Project Cache Keys
func getProjectCacheKey(projectID string) string {
	return fmt.Sprintf("project:%s", projectID)
}

// GetProjectFromCache retrieves a project from Redis
func GetProjectFromCache(projectID string) (*Project, error) {
	if redisClient == nil {
		return nil, fmt.Errorf("redis not initialized")
	}

	val, err := redisClient.Get(ctx, getProjectCacheKey(projectID)).Result()
	if err == redis.Nil {
		return nil, nil // Cache miss
	} else if err != nil {
		return nil, err
	}

	var project Project
	if err := json.Unmarshal([]byte(val), &project); err != nil {
		return nil, err
	}

	return &project, nil
}

// SetProjectToCache saves a project to Redis
func SetProjectToCache(project *Project) error {
	if redisClient == nil {
		return nil
	}

	data, err := json.Marshal(project)
	if err != nil {
		return err
	}

	// Cache for 1 hour (or adjust as needed)
	return redisClient.Set(ctx, getProjectCacheKey(project.ID), data, time.Hour).Err()
}

// InvalidateProjectCache removes a project from Redis
func InvalidateProjectCache(projectID string) error {
	if redisClient == nil {
		return nil
	}
	return redisClient.Del(ctx, getProjectCacheKey(projectID)).Err()
}
