package main

import (
	"context"
	"fmt"
	"os"
	"strconv"
	"time"

	"github.com/joho/godotenv"
	"github.com/redis/go-redis/v9"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

var globalDB *gorm.DB
var redisClient *redis.Client
var jwtSecret = []byte(GetEnv("JWT_SECRET", "your-secret-key"))

func GetEnv(key, defaultValue string) string {
	value := os.Getenv(key)
	if value == "" {
		return defaultValue
	}
	return value
}

func LoadEnv() error {
	path := GetEnv("ENV_FILE", ".env")
	return godotenv.Load(path)
}

type DatabaseConfig struct {
	Host     string
	Port     string
	User     string
	Password string
	Name     string
	SSLMode  string
	Timezone string
}

func LoadDatabaseConfig() DatabaseConfig {
	return DatabaseConfig{
		Host:     GetEnv("DB_HOST", "localhost"),
		Port:     GetEnv("DB_PORT", "5432"),
		User:     GetEnv("DB_USER", "postgres"),
		Password: GetEnv("DB_PASSWORD", ""),
		Name:     GetEnv("DB_NAME", "auto_tauri"),
		SSLMode:  GetEnv("DB_SSLMODE", "disable"),
		Timezone: GetEnv("DB_TIMEZONE", "Asia/Shanghai"),
	}
}

func initDB() error {
	cfg := LoadDatabaseConfig()
	dsn := fmt.Sprintf(
		"host=%s user=%s password=%s dbname=%s port=%s sslmode=%s TimeZone=%s",
		cfg.Host,
		cfg.User,
		cfg.Password,
		cfg.Name,
		cfg.Port,
		cfg.SSLMode,
		cfg.Timezone,
	)

	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{})
	if err != nil {
		return err
	}

	sqlDB, err := db.DB()
	if err != nil {
		return err
	}

	sqlDB.SetMaxIdleConns(10)
	sqlDB.SetMaxOpenConns(50)
	sqlDB.SetConnMaxLifetime(30 * time.Minute)

	globalDB = db
	return AutoMigrate(globalDB)
}

type RedisConfig struct {
	Addr     string
	Password string
	DB       int
}

func LoadRedisConfig() RedisConfig {
	dbIndex, err := strconv.Atoi(GetEnv("REDIS_DB", "0"))
	if err != nil {
		dbIndex = 0
	}
	return RedisConfig{
		Addr:     GetEnv("REDIS_ADDR", "go-api.meetlife.com.cn:60379"),
		Password: GetEnv("REDIS_PASSWORD", "redis_CpfaGN"),
		DB:       dbIndex,
	}
}

func initRedis() {
	cfg := LoadRedisConfig()
	client := redis.NewClient(&redis.Options{
		Addr:     cfg.Addr,
		Password: cfg.Password,
		DB:       cfg.DB,
	})
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := client.Ping(ctx).Err(); err != nil {
		redisClient = nil
		return
	}
	redisClient = client
}