/**
 * 🔍 Lightbox Monitor - 独立的灯箱监控工具
 * 可以单独启用/禁用监控功能，不影响lightbox主要功能
 * 使用方式：LightboxMonitor.enable() 或 LightboxMonitor.disable()
 */

window.LightboxMonitor = (function() {
  'use strict';

  // 监控配置
  let isEnabled = false;
  let config = {
    logPerformance: true,    // 性能日志
    logScrollLock: true,     // 滚动锁定日志
    logImageLoading: true,   // 图片加载日志
    logInitialization: true, // 初始化日志
    logInteractions: true,   // 用户交互日志
    logErrors: true,         // 错误日志
    showTimestamps: true,    // 显示时间戳
    groupLogs: true          // 分组显示日志
  };

  // 日志样式
  const styles = {
    info: 'color: #2196F3; font-weight: bold;',
    success: 'color: #4CAF50; font-weight: bold;',
    warning: 'color: #FF9800; font-weight: bold;',
    error: 'color: #F44336; font-weight: bold;',
    performance: 'color: #9C27B0; font-weight: bold;',
    timestamp: 'color: #666; font-size: 10px;'
  };

  // 统计数据
  let stats = {
    imagesLoaded: 0,
    lightboxOpened: 0,
    scrollLockOperations: 0,
    performanceData: [],
    errors: []
  };

  // 开始时间记录
  let startTimes = new Map();

  /**
   * 格式化日志输出
   */
  function formatLog(category, message, data = null, style = 'info') {
    if (!isEnabled) return;

    const timestamp = config.showTimestamps ? 
      `[${new Date().toLocaleTimeString()}.${Date.now() % 1000}]` : '';
    
    const prefix = `🔍 [LB-Monitor]${timestamp}`;
    
    if (config.groupLogs) {
      console.groupCollapsed(`%c${prefix} ${category}`, styles[style]);
      console.log(`%c${message}`, styles[style]);
      if (data) {
        console.log('📊 数据:', data);
      }
      console.groupEnd();
    } else {
      console.log(`%c${prefix} [${category}] ${message}`, styles[style]);
      if (data) {
        console.log('📊', data);
      }
    }
  }

  /**
   * 性能计时器
   */
  function startTimer(key) {
    if (!isEnabled || !config.logPerformance) return;
    startTimes.set(key, performance.now());
  }

  function endTimer(key, description) {
    if (!isEnabled || !config.logPerformance) return;
    
    const startTime = startTimes.get(key);
    if (startTime) {
      const duration = performance.now() - startTime;
      formatLog('性能', `${description}: ${duration.toFixed(2)}ms`, null, 'performance');
      
      stats.performanceData.push({
        operation: description,
        duration: duration,
        timestamp: Date.now()
      });
      
      startTimes.delete(key);
    }
  }

  /**
   * 监控钩子函数
   */
  const hooks = {
    // 初始化监控
    onInitialization: function(selector, imageCount) {
      if (!config.logInitialization) return;
      formatLog('初始化', `检测到 ${imageCount} 个灯箱图片`, { 
        selector, 
        imageCount,
        timestamp: new Date().toISOString()
      }, 'success');
    },

    // 滚动锁定监控
    onScrollLock: function(scrollData) {
      if (!config.logScrollLock) return;
      startTimer('scrollLock');
      formatLog('滚动锁定', '开始锁定滚动', scrollData, 'info');
      stats.scrollLockOperations++;
    },

    onScrollLockComplete: function(finalData) {
      if (!config.logScrollLock) return;
      endTimer('scrollLock', '滚动锁定');
      formatLog('滚动锁定', '锁定完成', finalData, 'success');
    },

    onScrollUnlock: function(unlockData) {
      if (!config.logScrollLock) return;
      startTimer('scrollUnlock');
      formatLog('滚动解锁', '开始解锁滚动', unlockData, 'info');
    },

    onScrollUnlockComplete: function(finalData) {
      if (!config.logScrollLock) return;
      endTimer('scrollUnlock', '滚动解锁');
      formatLog('滚动解锁', '解锁完成', finalData, 'success');
    },

    // 图片加载监控
    onImageLoadStart: function(imageSrc, imageData) {
      if (!config.logImageLoading) return;
      startTimer(`image-${imageSrc}`);
      formatLog('图片加载', `开始加载: ${imageSrc.split('/').pop()}`, imageData, 'info');
    },

    onImageLoadComplete: function(imageSrc, imageData) {
      if (!config.logImageLoading) return;
      endTimer(`image-${imageSrc}`, `图片加载: ${imageSrc.split('/').pop()}`);
      formatLog('图片加载', `加载完成: ${imageSrc.split('/').pop()}`, imageData, 'success');
      stats.imagesLoaded++;
    },

    onImageLoadError: function(imageSrc, error) {
      if (!config.logErrors) return;
      formatLog('图片加载', `加载失败: ${imageSrc.split('/').pop()}`, error, 'error');
      stats.errors.push({
        type: 'image_load',
        src: imageSrc,
        error: error,
        timestamp: Date.now()
      });
    },

    // 灯箱交互监控
    onLightboxOpen: function(imageData) {
      if (!config.logInteractions) return;
      startTimer('lightboxOpen');
      formatLog('灯箱交互', '灯箱打开', imageData, 'info');
      stats.lightboxOpened++;
    },

    onLightboxOpenComplete: function() {
      if (!config.logInteractions) return;
      endTimer('lightboxOpen', '灯箱打开');
    },

    onLightboxClose: function() {
      if (!config.logInteractions) return;
      startTimer('lightboxClose');
      formatLog('灯箱交互', '灯箱关闭', null, 'info');
    },

    onLightboxCloseComplete: function() {
      if (!config.logInteractions) return;
      endTimer('lightboxClose', '灯箱关闭');
    },

    // 错误监控
    onError: function(errorType, errorData) {
      if (!config.logErrors) return;
      formatLog('错误', `${errorType}`, errorData, 'error');
      stats.errors.push({
        type: errorType,
        data: errorData,
        timestamp: Date.now()
      });
    }
  };

  /**
   * 公共API
   */
  return {
    // 启用监控
    enable: function(userConfig = {}) {
      isEnabled = true;
      config = { ...config, ...userConfig };
      
      console.log('%c🔍 Lightbox Monitor 已启用', 'color: #4CAF50; font-weight: bold; font-size: 14px;');
      console.log('%c配置:', 'color: #666;', config);
      
      // 重置统计
      stats = {
        imagesLoaded: 0,
        lightboxOpened: 0,
        scrollLockOperations: 0,
        performanceData: [],
        errors: []
      };
      
      return this;
    },

    // 禁用监控
    disable: function() {
      isEnabled = false;
      console.log('%c🔍 Lightbox Monitor 已禁用', 'color: #FF9800; font-weight: bold;');
      return this;
    },

    // 检查状态
    isEnabled: function() {
      return isEnabled;
    },

    // 获取统计数据
    getStats: function() {
      return { ...stats };
    },

    // 获取性能报告
    getPerformanceReport: function() {
      if (!isEnabled) {
        console.warn('监控未启用，无法生成性能报告');
        return null;
      }

      const report = {
        summary: {
          totalImages: stats.imagesLoaded,
          totalLightboxOpens: stats.lightboxOpened,
          totalScrollLocks: stats.scrollLockOperations,
          totalErrors: stats.errors.length
        },
        performance: {
          averageImageLoadTime: 0,
          averageLightboxOpenTime: 0,
          averageScrollLockTime: 0
        },
        errors: stats.errors
      };

      // 计算平均性能
      const perfData = stats.performanceData;
      if (perfData.length > 0) {
        const imageLoads = perfData.filter(p => p.operation.includes('图片加载'));
        const lightboxOpens = perfData.filter(p => p.operation.includes('灯箱打开'));
        const scrollLocks = perfData.filter(p => p.operation.includes('滚动锁定'));

        if (imageLoads.length > 0) {
          report.performance.averageImageLoadTime = 
            imageLoads.reduce((sum, p) => sum + p.duration, 0) / imageLoads.length;
        }
        if (lightboxOpens.length > 0) {
          report.performance.averageLightboxOpenTime = 
            lightboxOpens.reduce((sum, p) => sum + p.duration, 0) / lightboxOpens.length;
        }
        if (scrollLocks.length > 0) {
          report.performance.averageScrollLockTime = 
            scrollLocks.reduce((sum, p) => sum + p.duration, 0) / scrollLocks.length;
        }
      }

      console.group('%c📊 Lightbox 性能报告', 'color: #2196F3; font-weight: bold; font-size: 16px;');
      console.table(report.summary);
      console.table(report.performance);
      if (report.errors.length > 0) {
        console.warn('发现错误:', report.errors);
      }
      console.groupEnd();

      return report;
    },

    // 清除统计数据
    clearStats: function() {
      stats = {
        imagesLoaded: 0,
        lightboxOpened: 0,
        scrollLockOperations: 0,
        performanceData: [],
        errors: []
      };
      console.log('%c📊 统计数据已清除', 'color: #FF9800;');
      return this;
    },

    // 更新配置
    configure: function(newConfig) {
      config = { ...config, ...newConfig };
      console.log('%c⚙️ 配置已更新', 'color: #9C27B0;', config);
      return this;
    },

    // 监控钩子 - 供lightbox.js调用
    hooks: hooks,

    // 快捷方法
    enableBasic: function() {
      return this.enable({
        logPerformance: false,
        logScrollLock: false,
        logImageLoading: true,
        logInitialization: true,
        logInteractions: true,
        logErrors: true,
        showTimestamps: false,
        groupLogs: false
      });
    },

    enableFull: function() {
      return this.enable(); // 使用默认的完整配置
    },

    enablePerformanceOnly: function() {
      return this.enable({
        logPerformance: true,
        logScrollLock: false,
        logImageLoading: false,
        logInitialization: false,
        logInteractions: false,
        logErrors: true,
        showTimestamps: true,
        groupLogs: true
      });
    }
  };
})();

// 使用说明
console.log(`
%c🔍 Lightbox Monitor 使用说明

基础监控:    LightboxMonitor.enableBasic()
完整监控:    LightboxMonitor.enableFull()
性能监控:    LightboxMonitor.enablePerformanceOnly()
禁用监控:    LightboxMonitor.disable()
查看统计:    LightboxMonitor.getStats()
性能报告:    LightboxMonitor.getPerformanceReport()
清除数据:    LightboxMonitor.clearStats()

`, 'color: #666; font-size: 12px;');