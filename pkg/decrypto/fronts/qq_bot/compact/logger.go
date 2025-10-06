package compact

import (
	"fmt"
	"log/slog"
)

// import "githu.com/sirupsen/logrus"

type Logger struct {
	log *slog.Logger
}

func (l *Logger) Debug(v ...any)                 { l.log.Debug("", v...) }
func (l *Logger) Info(v ...any)                  { l.log.Info("", v...) }
func (l *Logger) Warn(v ...any)                  { l.log.Warn("", v...) }
func (l *Logger) Error(v ...any)                 { l.log.Error("", v...) }
func (l *Logger) Debugf(format string, v ...any) { l.log.Debug(fmt.Sprintf(format, v...)) }
func (l *Logger) Infof(format string, v ...any)  { l.log.Info(fmt.Sprintf(format, v...)) }
func (l *Logger) Warnf(format string, v ...any)  { l.log.Warn(fmt.Sprintf(format, v...)) }
func (l *Logger) Errorf(format string, v ...any) { l.log.Error(fmt.Sprintf(format, v...)) }
func (l *Logger) Sync() error                    { return nil }

func New(sLogger *slog.Logger) *Logger {
	return &Logger{
		log: sLogger,
	}
}
