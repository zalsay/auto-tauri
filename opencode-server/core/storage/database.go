package storage

import (
	"fmt"
	"time"

	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
	"gorm.io/gorm/schema"
	"opencode-server/core/config"
)

var globalDB *gorm.DB

func InitDB(cfg *config.DatabaseConfig) error {
	var err error

	globalDB, err = gorm.Open(postgres.Open(cfg.DSN()), &gorm.Config{
		NamingStrategy: schema.NamingStrategy{
			TablePrefix:   "",
			SingularTable: true,
		},
		Logger: logger.Default.LogMode(logger.Info),
	})
	if err != nil {
		return fmt.Errorf("failed to connect to database: %w", err)
	}

	sqlDB, err := globalDB.DB()
	if err != nil {
		return fmt.Errorf("failed to get underlying sql.DB: %w", err)
	}

	sqlDB.SetMaxOpenConns(cfg.MaxOpenConns)
	sqlDB.SetMaxIdleConns(cfg.MaxIdleConns)
	sqlDB.SetConnMaxLifetime(time.Duration(cfg.ConnMaxLifetime) * time.Second)

	return nil
}

func GetDB() *gorm.DB {
	return globalDB
}

func CloseDB() error {
	if globalDB != nil {
		sqlDB, err := globalDB.DB()
		if err != nil {
			return err
		}
		return sqlDB.Close()
	}
	return nil
}
