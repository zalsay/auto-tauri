package main

import (
	"context"
	"encoding/json"
	"time"

	"github.com/redis/go-redis/v9"
)

const (
	userCacheTTL = 30 * time.Minute
)

// Cache key generators
func userCacheKey(id string) string {
	return "user:" + id
}

func userEmailIndexKey(email string) string {
	return "user:email:" + email
}

// CacheUser stores a user in Redis cache
func CacheUser(ctx context.Context, user *User) error {
	if redisClient == nil {
		return nil
	}
	data, err := json.Marshal(user)
	if err != nil {
		return err
	}
	pipe := redisClient.Pipeline()
	pipe.Set(ctx, userCacheKey(user.ID), data, userCacheTTL)
	pipe.Set(ctx, userEmailIndexKey(user.Email), user.ID, userCacheTTL)
	_, err = pipe.Exec(ctx)
	return err
}

// GetUserFromCache retrieves a user from Redis cache by ID
func GetUserFromCache(ctx context.Context, id string) (*User, error) {
	if redisClient == nil {
		return nil, redis.Nil
	}
	data, err := redisClient.Get(ctx, userCacheKey(id)).Bytes()
	if err != nil {
		return nil, err
	}
	var user User
	if err := json.Unmarshal(data, &user); err != nil {
		return nil, err
	}
	return &user, nil
}

// GetUserByEmailFromCache retrieves a user from Redis cache by email
func GetUserByEmailFromCache(ctx context.Context, email string) (*User, error) {
	if redisClient == nil {
		return nil, redis.Nil
	}
	userID, err := redisClient.Get(ctx, userEmailIndexKey(email)).Result()
	if err != nil {
		return nil, err
	}
	return GetUserFromCache(ctx, userID)
}

// InvalidateUserCache removes a user from Redis cache
func InvalidateUserCache(ctx context.Context, id, email string) error {
	if redisClient == nil {
		return nil
	}
	pipe := redisClient.Pipeline()
	pipe.Del(ctx, userCacheKey(id))
	if email != "" {
		pipe.Del(ctx, userEmailIndexKey(email))
	}
	_, err := pipe.Exec(ctx)
	return err
}

// CreateUserWithCache creates a user in Postgres then caches in Redis
func CreateUserWithCache(user *User) error {
	if err := globalDB.Create(user).Error; err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	CacheUser(ctx, user) // Best effort cache, ignore errors
	return nil
}

// GetUserWithCache gets user by ID, Redis first then Postgres
func GetUserWithCache(id string) (*User, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	// Try cache first
	if user, err := GetUserFromCache(ctx, id); err == nil {
		return user, nil
	}

	// Cache miss, query Postgres
	var user User
	if err := globalDB.Where("id = ?", id).First(&user).Error; err != nil {
		return nil, err
	}

	// Backfill cache
	CacheUser(ctx, &user)
	return &user, nil
}

// GetUserByEmailWithCache gets user by email, Redis first then Postgres
func GetUserByEmailWithCache(email string) (*User, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	// Try cache first
	if user, err := GetUserByEmailFromCache(ctx, email); err == nil {
		return user, nil
	}

	// Cache miss, query Postgres
	var user User
	if err := globalDB.Where("email = ?", email).First(&user).Error; err != nil {
		return nil, err
	}

	// Backfill cache
	CacheUser(ctx, &user)
	return &user, nil
}

// UpdateUserWithCache updates user in Postgres and invalidates cache
func UpdateUserWithCache(user *User) error {
	if err := globalDB.Save(user).Error; err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	// Invalidate old cache and set new cache
	InvalidateUserCache(ctx, user.ID, user.Email)
	CacheUser(ctx, user)
	return nil
}

// InvalidateUserCacheByID invalidates user cache by ID (fetches email from cache/db)
func InvalidateUserCacheByID(userID string) {
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	// Try to get user to get email for index cleanup
	var email string
	if user, err := GetUserFromCache(ctx, userID); err == nil {
		email = user.Email
	} else {
		var dbUser User
		if globalDB.Select("email").Where("id = ?", userID).First(&dbUser).Error == nil {
			email = dbUser.Email
		}
	}
	InvalidateUserCache(ctx, userID, email)
}
