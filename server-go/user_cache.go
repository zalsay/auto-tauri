package main

import (
	"context"
	"encoding/json"
	"log"
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
		log.Printf("[GetUserFromCache] Redis miss for userID: %s", id)
		return nil, err
	}
	log.Printf("[GetUserFromCache] Redis hit for userID: %s, raw data len: %d", id, len(data))

	var user User
	if err := json.Unmarshal(data, &user); err != nil {
		log.Printf("[GetUserFromCache] JSON unmarshal failed: %v", err)
		return nil, err
	}
	log.Printf("[GetUserFromCache] Parsed user: ID=%s, Email=%s, PasswordHashLen=%d", user.ID, user.Email, len(user.PasswordHash))
	return &user, nil
}

// GetUserByEmailFromCache retrieves a user from Redis cache by email
func GetUserByEmailFromCache(ctx context.Context, email string) (*User, error) {
	if redisClient == nil {
		return nil, redis.Nil
	}
	userID, err := redisClient.Get(ctx, userEmailIndexKey(email)).Result()
	if err != nil {
		log.Printf("[GetUserByEmailFromCache] Redis miss for email index: %s", email)
		return nil, err
	}
	log.Printf("[GetUserByEmailFromCache] Redis hit for email index: %s -> %s", email, userID)
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
	if user, err := GetUserFromCache(ctx, id); err == nil && user.PasswordHash != "" {
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
	if user, err := GetUserByEmailFromCache(ctx, email); err == nil && user.PasswordHash != "" {
		log.Printf("[GetUserByEmailWithCache] Cache hit for email=%s, userID=%s", email, user.ID)
		return user, nil
	}

	// Cache miss, query Postgres
	var user User
	if err := globalDB.Where("email = ?", email).First(&user).Error; err != nil {
		log.Printf("[GetUserByEmailWithCache] DB lookup failed for email=%s: %v", email, err)
		return nil, err
	}

	// Backfill cache
	if err := CacheUser(ctx, &user); err != nil {
		log.Printf("[GetUserByEmailWithCache] Cache backfill failed for userID=%s, email=%s: %v", user.ID, user.Email, err)
	} else {
		log.Printf("[GetUserByEmailWithCache] Cache backfilled for userID=%s, email=%s", user.ID, user.Email)
	}
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
