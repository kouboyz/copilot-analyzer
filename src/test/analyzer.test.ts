import { describe, it, expect } from 'vitest';
import * as path from 'path';
import { parseSession } from '../analyzer';

const fixturesDir = path.join(__dirname, 'fixtures');

describe('parseSession', () => {
  describe('session-basic', () => {
    const sessionDir = path.join(fixturesDir, 'session-basic');

    it('セッションを正常にパースできる', () => {
      const result = parseSession(sessionDir, 'ja');
      expect(result).not.toBeNull();
    });

    it('llm_requestを正しく集計する', () => {
      const result = parseSession(sessionDir, 'ja')!;
      expect(result.llmRequests).toHaveLength(2);
      expect(result.totalInputTokens).toBe(102000);
      expect(result.totalOutputTokens).toBe(800);
      expect(result.totalCachedTokens).toBe(88000);
    });

    it('キャッシュ率を正しく計算する', () => {
      const result = parseSession(sessionDir, 'ja')!;
      // 88000 / 102000 ≈ 0.863
      expect(result.cacheRate).toBeCloseTo(0.863, 2);
    });

    it('ターン数を正しく集計する', () => {
      const result = parseSession(sessionDir, 'ja')!;
      expect(result.turnCount).toBe(2);
    });

    it('使用ツールを正しく検出する', () => {
      const result = parseSession(sessionDir, 'ja')!;
      expect(result.toolCallNames).toContain('read_file');
      expect(result.toolCallNames).toContain('run_in_terminal');
    });

    it('未使用ツールを正しく検出する（tools_0.jsonのcontent形式）', () => {
      const result = parseSession(sessionDir, 'ja')!;
      expect(result.definedToolCount).toBe(4);
      expect(result.unusedTools).toContain('write_file');
      expect(result.unusedTools).toContain('grep_search');
    });

    it('タイトルを正しく取得する', () => {
      const result = parseSession(sessionDir, 'ja')!;
      expect(result.title).toBe('Fix terminal permissions');
    });

    it('コンテキスト溢れなし', () => {
      const result = parseSession(sessionDir, 'ja')!;
      expect(result.hasContextOverflow).toBe(false);
    });

    it('multiplier=0モデルはクレジット0', () => {
      const result = parseSession(sessionDir, 'ja')!;
      expect(result.totalCredits).toBe(0);
    });
  });

  describe('session-overflow', () => {
    const sessionDir = path.join(fixturesDir, 'session-overflow');

    it('コンテキスト溢れを検出する', () => {
      const result = parseSession(sessionDir, 'ja')!;
      expect(result.hasContextOverflow).toBe(true);
    });

    it('コンテキスト溢れの問題が検出される', () => {
      const result = parseSession(sessionDir, 'ja')!;
      const issue = result.issues.find(i => i.habit === 6 && i.severity === 'high');
      expect(issue).toBeDefined();
    });

    it('multiplier=1モデルのクレジットはリクエスト数と等しい', () => {
      const result = parseSession(sessionDir, 'ja')!;
      expect(result.totalCredits).toBe(2);
    });

    it('入力トークンが多い問題が検出される', () => {
      const result = parseSession(sessionDir, 'ja')!;
      const issue = result.issues.find(i => i.habit === 2);
      expect(issue).toBeDefined();
    });
  });

  describe('session-token-prices', () => {
    const sessionDir = path.join(fixturesDir, 'session-token-prices');

    it('token_prices方式でクレジットを計算する', () => {
      const result = parseSession(sessionDir, 'ja')!;
      // 実際の計算:
      // req1: (18630-5632)/1M*175 + 5632/1M*17 + 229/1M*1400 = 2.691
      // req2: (18899-18688)/1M*175 + 18688/1M*17 + 314/1M*1400 = 0.794
      // req3: (19250-19072)/1M*175 + 19072/1M*17 + 224/1M*1400 = 0.669
      // 合計 ≈ 4.154
      expect(result.totalCredits).toBeCloseTo(4.154, 1);
    });

    it('creditBreakdownにtoken_prices計算結果が入る', () => {
      const result = parseSession(sessionDir, 'ja')!;
      expect(result.creditBreakdown).toHaveLength(1);
      expect(result.creditBreakdown[0].modelId).toBe('gpt-5.3-codex');
      expect(result.creditBreakdown[0].requestCount).toBe(3);
    });

    it('multiplierが未定義でも0にならない', () => {
      const result = parseSession(sessionDir, 'ja')!;
      expect(result.totalCredits).toBeGreaterThan(0);
    });
  });

  describe('英語ロケール', () => {
    const sessionDir = path.join(fixturesDir, 'session-overflow');

    it('英語で問題タイトルが生成される', () => {
      const result = parseSession(sessionDir, 'en')!;
      const issue = result.issues.find(i => i.habit === 6 && i.severity === 'high');
      expect(issue?.title).toBe('Context window overflow');
    });

    it('日本語で問題タイトルが生成される', () => {
      const result = parseSession(sessionDir, 'ja')!;
      const issue = result.issues.find(i => i.habit === 6 && i.severity === 'high');
      expect(issue?.title).toBe('コンテキストウィンドウが溢れた');
    });
  });

  describe('不正データ', () => {
    it('存在しないディレクトリはnullを返す', () => {
      const result = parseSession('/nonexistent/path', 'ja');
      expect(result).toBeNull();
    });
  });
});
