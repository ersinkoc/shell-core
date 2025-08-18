#!/usr/bin/env node

/**
 * @oxog/shell-core - Log Analysis Example
 * 
 * This example demonstrates advanced text processing and analysis capabilities:
 * - Log file parsing and filtering
 * - Pattern matching and data extraction
 * - Statistical analysis
 * - Report generation
 * - Pipeline-based data processing
 * 
 * Author: Ersin KOÇ
 * Repository: https://github.com/ersinkoc/shell-core
 */

import { createShell } from '@oxog/shell-core';
import { join } from 'path';
import { tmpdir } from 'os';

class LogAnalyzer {
  constructor() {
    this.shell = createShell({
      silent: true // Keep quiet for cleaner analysis output
    });
  }
  
  // Generate sample log data for demonstration
  generateSampleLogs(dir) {
    const logEntries = [
      '2024-01-15 10:30:15 INFO  [UserService] User login successful: user123',
      '2024-01-15 10:30:16 ERROR [DatabaseService] Connection timeout after 30s',
      '2024-01-15 10:30:17 WARN  [CacheService] Cache miss for key: session_abc123',
      '2024-01-15 10:30:18 INFO  [AuthService] Token generated for user: user123',
      '2024-01-15 10:30:19 ERROR [PaymentService] Payment processing failed: insufficient_funds',
      '2024-01-15 10:30:20 INFO  [OrderService] New order created: order_789',
      '2024-01-15 10:30:21 DEBUG [DatabaseService] Query executed in 45ms',
      '2024-01-15 10:30:22 ERROR [EmailService] Failed to send notification: smtp_error',
      '2024-01-15 10:30:23 INFO  [UserService] Password reset requested: user456',
      '2024-01-15 10:30:24 WARN  [RateLimiter] Rate limit exceeded for IP: 192.168.1.100',
      '2024-01-15 10:31:15 INFO  [UserService] User logout: user123',
      '2024-01-15 10:31:16 ERROR [DatabaseService] Deadlock detected in transaction',
      '2024-01-15 10:31:17 INFO  [BackupService] Database backup completed successfully',
      '2024-01-15 10:31:18 ERROR [StorageService] Disk space critically low: 95% full',
      '2024-01-15 10:31:19 WARN  [SecurityService] Multiple failed login attempts: user789',
      '2024-01-15 10:31:20 INFO  [HealthCheck] All services healthy',
      '2024-01-15 10:31:21 ERROR [ApiGateway] Request timeout: /api/v1/users',
      '2024-01-15 10:31:22 DEBUG [CacheService] Cache hit ratio: 87%',
      '2024-01-15 10:31:23 INFO  [MonitoringService] CPU usage: 78%',
      '2024-01-15 10:31:24 ERROR [DatabaseService] Connection pool exhausted'
    ];
    
    return {
      'app.log': logEntries.slice(0, 15).join('\n'),
      'error.log': logEntries.filter(line => line.includes('ERROR')).join('\n'),
      'access.log': [
        '192.168.1.100 - - [15/Jan/2024:10:30:15 +0000] "GET /api/users HTTP/1.1" 200 1234',
        '192.168.1.101 - - [15/Jan/2024:10:30:16 +0000] "POST /api/login HTTP/1.1" 200 567',
        '192.168.1.102 - - [15/Jan/2024:10:30:17 +0000] "GET /api/orders HTTP/1.1" 404 89',
        '192.168.1.100 - - [15/Jan/2024:10:30:18 +0000] "DELETE /api/users/123 HTTP/1.1" 500 234',
        '192.168.1.103 - - [15/Jan/2024:10:30:19 +0000] "GET /health HTTP/1.1" 200 56'
      ].join('\n')
    };
  }
  
  async analyzeLogLevels(logFile) {
    console.log(`\n📊 Analyzing log levels in ${logFile}...`);
    
    const content = await this.shell.readFile(logFile);
    const lines = content.split('\n').filter(line => line.trim());
    
    const levels = {};
    const levelPattern = /(INFO|ERROR|WARN|DEBUG)/;
    
    for (const line of lines) {
      const match = line.match(levelPattern);
      if (match) {
        const level = match[1];
        levels[level] = (levels[level] || 0) + 1;
      }
    }
    
    console.log('Log Level Distribution:');
    Object.entries(levels)
      .sort(([,a], [,b]) => b - a)
      .forEach(([level, count]) => {
        const percentage = ((count / lines.length) * 100).toFixed(1);
        const bar = '█'.repeat(Math.ceil(count / Math.max(...Object.values(levels)) * 20));
        console.log(`   ${level.padEnd(5)}: ${count.toString().padStart(3)} (${percentage}%) ${bar}`);
      });
    
    return levels;
  }
  
  async extractErrors(logFile) {
    console.log(`\n🚨 Extracting errors from ${logFile}...`);
    
    const errorLines = await this.shell.text(await this.shell.readFile(logFile))
      .grep('ERROR')
      .result;
    
    const errorPatterns = {};
    const servicePattern = /\[(\w+Service|\w+Gateway|\w+)\]/;
    const messagePattern = /ERROR\s+\[\w+\]\s+(.+)$/;
    
    for (const line of errorLines) {
      const serviceMatch = line.match(servicePattern);
      const messageMatch = line.match(messagePattern);
      
      if (serviceMatch && messageMatch) {
        const service = serviceMatch[1];
        const message = messageMatch[1];
        
        if (!errorPatterns[service]) {
          errorPatterns[service] = [];
        }
        errorPatterns[service].push(message);
      }
    }
    
    console.log('Errors by Service:');
    Object.entries(errorPatterns).forEach(([service, messages]) => {
      console.log(`   ${service}:`);
      messages.forEach(message => {
        console.log(`     • ${message}`);
      });
    });
    
    return errorPatterns;
  }
  
  async analyzeAccessLogs(logFile) {
    console.log(`\n🌐 Analyzing access patterns in ${logFile}...`);
    
    const content = await this.shell.readFile(logFile);
    const lines = content.split('\n').filter(line => line.trim());
    
    const ipPattern = /^(\d+\.\d+\.\d+\.\d+)/;
    const methodPattern = /"(\w+)\s+([^\s]+)\s+HTTP/;
    const statusPattern = /"\s+(\d{3})\s+/;
    
    const stats = {
      ips: {},
      methods: {},
      endpoints: {},
      statusCodes: {},
      total: lines.length
    };
    
    for (const line of lines) {
      const ipMatch = line.match(ipPattern);
      const methodMatch = line.match(methodPattern);
      const statusMatch = line.match(statusPattern);
      
      if (ipMatch) {
        const ip = ipMatch[1];
        stats.ips[ip] = (stats.ips[ip] || 0) + 1;
      }
      
      if (methodMatch) {
        const method = methodMatch[1];
        const endpoint = methodMatch[2];
        stats.methods[method] = (stats.methods[method] || 0) + 1;
        stats.endpoints[endpoint] = (stats.endpoints[endpoint] || 0) + 1;
      }
      
      if (statusMatch) {
        const status = statusMatch[1];
        stats.statusCodes[status] = (stats.statusCodes[status] || 0) + 1;
      }
    }
    
    // Display results
    console.log('Top IPs:');
    Object.entries(stats.ips)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5)
      .forEach(([ip, count]) => {
        console.log(`   ${ip}: ${count} requests`);
      });
    
    console.log('\nHTTP Methods:');
    Object.entries(stats.methods)
      .sort(([,a], [,b]) => b - a)
      .forEach(([method, count]) => {
        console.log(`   ${method}: ${count}`);
      });
    
    console.log('\nStatus Codes:');
    Object.entries(stats.statusCodes)
      .sort(([,a], [,b]) => b - a)
      .forEach(([status, count]) => {
        const percentage = ((count / stats.total) * 100).toFixed(1);
        console.log(`   ${status}: ${count} (${percentage}%)`);
      });
    
    return stats;
  }
  
  async findAnomalies(logFile) {
    console.log(`\n🔍 Detecting anomalies in ${logFile}...`);
    
    const content = await this.shell.readFile(logFile);
    const lines = content.split('\n').filter(line => line.trim());
    
    const anomalies = [];
    
    // Define anomaly patterns
    const patterns = [
      {
        name: 'High Error Rate',
        pattern: /ERROR/,
        threshold: 0.3 // More than 30% errors
      },
      {
        name: 'Database Issues',
        pattern: /(timeout|deadlock|connection.*fail)/i,
        threshold: 0
      },
      {
        name: 'Security Concerns',
        pattern: /(failed.*login|rate.*limit|unauthorized)/i,
        threshold: 0
      },
      {
        name: 'Performance Issues',
        pattern: /(slow|timeout|exhausted)/i,
        threshold: 0
      }
    ];
    
    for (const pattern of patterns) {
      const matches = lines.filter(line => pattern.pattern.test(line));
      const ratio = matches.length / lines.length;
      
      if (matches.length > 0 && ratio > pattern.threshold) {
        anomalies.push({
          type: pattern.name,
          count: matches.length,
          ratio: ratio,
          samples: matches.slice(0, 3) // Show first 3 examples
        });
      }
    }
    
    if (anomalies.length > 0) {
      console.log('Detected Anomalies:');
      anomalies.forEach(anomaly => {
        console.log(`   ⚠️ ${anomaly.type}: ${anomaly.count} occurrences`);
        anomaly.samples.forEach(sample => {
          console.log(`     → ${sample.slice(0, 80)}...`);
        });
      });
    } else {
      console.log('   ✅ No significant anomalies detected');
    }
    
    return anomalies;
  }
  
  async generateReport(analysisResults, outputFile) {
    console.log(`\n📋 Generating analysis report...`);
    
    const report = {
      timestamp: new Date().toISOString(),
      summary: {
        totalLogs: Object.values(analysisResults.logLevels).reduce((a, b) => a + b, 0),
        errorCount: analysisResults.logLevels.ERROR || 0,
        warningCount: analysisResults.logLevels.WARN || 0,
        servicesWithErrors: Object.keys(analysisResults.errorPatterns).length,
        anomaliesDetected: analysisResults.anomalies.length
      },
      details: analysisResults,
      recommendations: []
    };
    
    // Generate recommendations
    if (report.summary.errorCount > 0) {
      report.recommendations.push('Investigate and resolve error conditions');
    }
    
    if (analysisResults.anomalies.length > 0) {
      report.recommendations.push('Address detected anomalies immediately');
    }
    
    if (analysisResults.accessStats && analysisResults.accessStats.statusCodes['500']) {
      report.recommendations.push('Check server errors and application stability');
    }
    
    if (report.recommendations.length === 0) {
      report.recommendations.push('System appears to be running normally');
    }
    
    await this.shell.writeFile(outputFile, JSON.stringify(report, null, 2));
    
    console.log(`✅ Report generated: ${outputFile}`);
    console.log('\n📈 Summary:');
    console.log(`   Total log entries: ${report.summary.totalLogs}`);
    console.log(`   Errors: ${report.summary.errorCount}`);
    console.log(`   Warnings: ${report.summary.warningCount}`);
    console.log(`   Services with errors: ${report.summary.servicesWithErrors}`);
    console.log(`   Anomalies: ${report.summary.anomaliesDetected}`);
    
    return report;
  }
  
  async analyzeLogs(logDir) {
    console.log('🔍 Starting comprehensive log analysis...');
    
    const results = {};
    
    // Find all log files
    const logFiles = await this.shell.pipeline()
      .glob(join(logDir, '*.log'))
      .execute();
    
    console.log(`Found ${logFiles.length} log files to analyze`);
    
    // Analyze each log file
    for (const logFile of logFiles) {
      const fileName = logFile.split('/').pop().replace('.log', '');
      console.log(`\n📁 Processing ${fileName}.log...`);
      
      if (fileName === 'app' || fileName === 'error') {
        results.logLevels = await this.analyzeLogLevels(logFile);
        results.errorPatterns = await this.extractErrors(logFile);
        results.anomalies = await this.findAnomalies(logFile);
      } else if (fileName === 'access') {
        results.accessStats = await this.analyzeAccessLogs(logFile);
      }
    }
    
    // Generate comprehensive report
    const reportFile = join(logDir, 'analysis-report.json');
    results.report = await this.generateReport(results, reportFile);
    
    return results;
  }
}

// Demo function
async function logAnalysisDemo() {
  console.log('📊 @oxog/shell-core - Log Analysis Demo');
  console.log('======================================\n');
  
  const shell = createShell();
  const demoDir = join(tmpdir(), 'log-analysis-demo-' + Date.now());
  
  try {
    // Setup demo log files
    console.log('📁 Creating sample log files...');
    await shell.mkdir(demoDir, { recursive: true });
    
    const analyzer = new LogAnalyzer();
    const sampleLogs = analyzer.generateSampleLogs(demoDir);
    
    for (const [filename, content] of Object.entries(sampleLogs)) {
      await shell.writeFile(join(demoDir, filename), content);
      console.log(`   Created: ${filename}`);
    }
    
    console.log('✅ Sample log files created\n');
    
    // Perform analysis
    const results = await analyzer.analyzeLogs(demoDir);
    
    console.log('\n🎯 Analysis Complete!');
    console.log('====================');
    
    console.log('\n💡 This example demonstrates:');
    console.log('   • Pattern matching and text extraction');
    console.log('   • Statistical analysis of log data');
    console.log('   • Anomaly detection algorithms');
    console.log('   • Automated report generation');
    console.log('   • Pipeline-based file processing');
    console.log('   • Data aggregation and visualization');
    
    console.log('\n📚 Use cases:');
    console.log('   • Application monitoring and debugging');
    console.log('   • Security incident analysis');
    console.log('   • Performance optimization');
    console.log('   • Compliance reporting');
    console.log('   • Operational intelligence');
    
  } catch (error) {
    console.error('\n❌ Demo failed:', error.message);
  } finally {
    // Cleanup
    try {
      await shell.remove(demoDir, { recursive: true, force: true });
      console.log('\n🧹 Demo cleanup completed');
    } catch (cleanupError) {
      console.error('⚠️ Cleanup failed:', cleanupError.message);
    }
  }
}

// Run the demo
if (import.meta.url === `file://${process.argv[1]}`) {
  logAnalysisDemo().catch(console.error);
}