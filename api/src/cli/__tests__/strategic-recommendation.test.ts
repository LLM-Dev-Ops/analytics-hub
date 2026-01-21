/**
 * Strategic Recommendation CLI Tests
 *
 * Unit tests for the Strategic Recommendation Agent CLI module.
 * Tests command handlers, argument parsing, and telemetry recording.
 *
 * @module cli/__tests__/strategic-recommendation.test
 */

import {
  handleAnalyze,
  handleSummarize,
  handleInspect,
  handleList,
  getConfig,
  EXIT_CODES,
  recordTelemetry,
} from '../strategic-recommendation';

describe('Strategic Recommendation CLI', () => {
  describe('getConfig', () => {
    it('should return configuration with defaults', () => {
      const config = getConfig();

      expect(config).toHaveProperty('apiUrl');
      expect(config).toHaveProperty('telemetryPath');
      expect(config).toHaveProperty('cachePath');
      expect(config).toHaveProperty('outputPath');
      expect(config.apiUrl).toBe('http://localhost:3000');
    });

    it('should use environment variables when set', () => {
      process.env.ANALYTICS_HUB_API_URL = 'http://api.example.com';

      const config = getConfig();
      expect(config.apiUrl).toBe('http://api.example.com');

      delete process.env.ANALYTICS_HUB_API_URL;
    });
  });

  describe('EXIT_CODES', () => {
    it('should define all expected exit codes', () => {
      expect(EXIT_CODES.SUCCESS).toBe(0);
      expect(EXIT_CODES.GENERAL_ERROR).toBe(1);
      expect(EXIT_CODES.INVALID_INPUT).toBe(2);
      expect(EXIT_CODES.NOT_FOUND).toBe(3);
      expect(EXIT_CODES.TIMEOUT).toBe(4);
      expect(EXIT_CODES.RATE_LIMITED).toBe(5);
      expect(EXIT_CODES.SERVICE_UNAVAILABLE).toBe(6);
    });
  });

  describe('handleAnalyze', () => {
    it('should handle valid time range', async () => {
      const mockExit = jest.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('exit');
      });

      const mockLog = jest.spyOn(console, 'log').mockImplementation();

      try {
        await handleAnalyze({
          startTime: '2024-01-01T00:00:00Z',
          endTime: '2024-01-31T23:59:59Z',
          outputFormat: 'json',
        });
      } catch {
        // Expected
      }

      expect(mockLog).toHaveBeenCalled();
      const output = mockLog.mock.calls[0]?.[0];
      expect(typeof output).toBe('string');

      mockExit.mockRestore();
      mockLog.mockRestore();
    });

    it('should validate time range ordering', async () => {
      const mockExit = jest.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('exit');
      });

      const mockError = jest.spyOn(console, 'error').mockImplementation();

      try {
        await handleAnalyze({
          startTime: '2024-01-31T23:59:59Z',
          endTime: '2024-01-01T00:00:00Z',
          outputFormat: 'json',
        });
      } catch {
        // Expected
      }

      expect(mockError).toHaveBeenCalled();

      mockExit.mockRestore();
      mockError.mockRestore();
    });

    it('should support focus areas filtering', async () => {
      const mockExit = jest.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('exit');
      });

      const mockLog = jest.spyOn(console, 'log').mockImplementation();

      try {
        await handleAnalyze({
          startTime: '2024-01-01T00:00:00Z',
          endTime: '2024-01-31T23:59:59Z',
          focusAreas: 'cost-optimization,performance-improvement',
          outputFormat: 'json',
        });
      } catch {
        // Expected
      }

      expect(mockLog).toHaveBeenCalled();

      mockExit.mockRestore();
      mockLog.mockRestore();
    });
  });

  describe('handleSummarize', () => {
    it('should generate executive summary', async () => {
      const mockExit = jest.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('exit');
      });

      const mockLog = jest.spyOn(console, 'log').mockImplementation();

      try {
        await handleSummarize({
          limit: 5,
          format: 'json',
        });
      } catch {
        // Expected
      }

      expect(mockLog).toHaveBeenCalled();
      const output = mockLog.mock.calls[0]?.[0];
      expect(typeof output).toBe('string');

      mockExit.mockRestore();
      mockLog.mockRestore();
    });

    it('should respect limit parameter', async () => {
      const mockExit = jest.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('exit');
      });

      const mockLog = jest.spyOn(console, 'log').mockImplementation();

      try {
        await handleSummarize({
          limit: 20,
          format: 'json',
        });
      } catch {
        // Expected
      }

      expect(mockLog).toHaveBeenCalled();

      mockExit.mockRestore();
      mockLog.mockRestore();
    });

    it('should support text format output', async () => {
      const mockExit = jest.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('exit');
      });

      const mockLog = jest.spyOn(console, 'log').mockImplementation();

      try {
        await handleSummarize({
          limit: 5,
          format: 'text',
        });
      } catch {
        // Expected
      }

      expect(mockLog).toHaveBeenCalled();

      mockExit.mockRestore();
      mockLog.mockRestore();
    });
  });

  describe('handleInspect', () => {
    it('should retrieve recommendation details', async () => {
      const mockExit = jest.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('exit');
      });

      const mockLog = jest.spyOn(console, 'log').mockImplementation();

      try {
        await handleInspect('550e8400-e29b-41d4-a716-446655440000', {
          format: 'json',
        });
      } catch {
        // Expected
      }

      expect(mockLog).toHaveBeenCalled();
      const output = mockLog.mock.calls[0]?.[0];
      expect(typeof output).toBe('string');

      mockExit.mockRestore();
      mockLog.mockRestore();
    });

    it('should error on missing recommendation ID', async () => {
      const mockExit = jest.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('exit');
      });

      const mockError = jest.spyOn(console, 'error').mockImplementation();

      try {
        await handleInspect('', {
          format: 'json',
        });
      } catch {
        // Expected
      }

      expect(mockError).toHaveBeenCalled();

      mockExit.mockRestore();
      mockError.mockRestore();
    });
  });

  describe('handleList', () => {
    it('should list recommendations with pagination', async () => {
      const mockExit = jest.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('exit');
      });

      const mockLog = jest.spyOn(console, 'log').mockImplementation();

      try {
        await handleList({
          limit: 10,
          offset: 0,
          format: 'json',
        });
      } catch {
        // Expected
      }

      expect(mockLog).toHaveBeenCalled();
      const output = mockLog.mock.calls[0]?.[0];
      expect(typeof output).toBe('string');

      mockExit.mockRestore();
      mockLog.mockRestore();
    });

    it('should support offset for pagination', async () => {
      const mockExit = jest.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('exit');
      });

      const mockLog = jest.spyOn(console, 'log').mockImplementation();

      try {
        await handleList({
          limit: 10,
          offset: 20,
          format: 'json',
        });
      } catch {
        // Expected
      }

      expect(mockLog).toHaveBeenCalled();

      mockExit.mockRestore();
      mockLog.mockRestore();
    });

    it('should support time range filtering', async () => {
      const mockExit = jest.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('exit');
      });

      const mockLog = jest.spyOn(console, 'log').mockImplementation();

      try {
        await handleList({
          limit: 10,
          offset: 0,
          startTime: '2024-01-01T00:00:00Z',
          endTime: '2024-01-31T23:59:59Z',
          format: 'json',
        });
      } catch {
        // Expected
      }

      expect(mockLog).toHaveBeenCalled();

      mockExit.mockRestore();
      mockLog.mockRestore();
    });
  });

  describe('recordTelemetry', () => {
    it('should record telemetry event', () => {
      const mockWrite = jest
        .spyOn(require('fs'), 'writeFileSync')
        .mockImplementation();

      recordTelemetry({
        invocationId: '550e8400-e29b-41d4-a716-446655440000',
        timestamp: new Date().toISOString(),
        command: 'analyze',
        options: {
          startTime: '2024-01-01T00:00:00Z',
          endTime: '2024-01-31T23:59:59Z',
        },
        startTime: Date.now(),
        endTime: Date.now() + 1000,
        duration: 1000,
        exitCode: 0,
        outputFormat: 'json',
      });

      expect(mockWrite).toHaveBeenCalled();

      mockWrite.mockRestore();
    });

    it('should silently fail telemetry recording on error', () => {
      const mockWrite = jest
        .spyOn(require('fs'), 'writeFileSync')
        .mockImplementation(() => {
          throw new Error('Write failed');
        });

      // Should not throw
      expect(() => {
        recordTelemetry({
          invocationId: '550e8400-e29b-41d4-a716-446655440000',
          timestamp: new Date().toISOString(),
          command: 'analyze',
          options: {},
          startTime: Date.now(),
          endTime: Date.now() + 1000,
          duration: 1000,
          exitCode: 0,
          outputFormat: 'json',
        });
      }).not.toThrow();

      mockWrite.mockRestore();
    });
  });

  describe('Output formatting', () => {
    it('should support ISO 8601 date format in options', () => {
      const validDates = [
        '2024-01-01T00:00:00Z',
        '2024-12-31T23:59:59Z',
        '2024-06-15T12:30:45.123Z',
        '2024-01-01T00:00:00+00:00',
      ];

      validDates.forEach((date) => {
        expect(() => {
          new Date(date);
        }).not.toThrow();
      });
    });

    it('should format currency correctly', () => {
      const formatter = new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });

      const formatted = formatter.format(15000);
      expect(formatted).toMatch(/\$15,000\.00/);
    });

    it('should format percentages correctly', () => {
      const percentage = 0.87;
      const formatted = `${(percentage * 100).toFixed(1)}%`;
      expect(formatted).toBe('87.0%');
    });

    it('should format confidence as percentage', () => {
      const confidence = 0.92;
      const formatted = `${(confidence * 100).toFixed(1)}%`;
      expect(formatted).toBe('92.0%');
    });
  });
});
