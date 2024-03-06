package compact

import "github.com/sirupsen/logrus"

type Logger struct {
	log *logrus.Logger
}

func (l *Logger) Debug(v ...interface{})                 { l.log.Debug(v...) }
func (l *Logger) Info(v ...interface{})                  { l.log.Info(v...) }
func (l *Logger) Warn(v ...interface{})                  { l.log.Warn(v...) }
func (l *Logger) Error(v ...interface{})                 { l.log.Error(v...) }
func (l *Logger) Debugf(format string, v ...interface{}) { l.log.Debugf(format, v...) }
func (l *Logger) Infof(format string, v ...interface{})  { l.log.Infof(format, v...) }
func (l *Logger) Warnf(format string, v ...interface{})  { l.log.Warnf(format, v...) }
func (l *Logger) Errorf(format string, v ...interface{}) { l.log.Errorf(format, v...) }
func (l *Logger) Sync() error                            { return nil }

func New(logrusLogger *logrus.Logger) *Logger {
	return &Logger{
		log: logrusLogger,
	}
}
