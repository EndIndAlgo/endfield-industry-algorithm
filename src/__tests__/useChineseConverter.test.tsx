import { render, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useChineseConverter } from '../hooks/useChineseConverter';
import { useSettingsStore } from '../store/settingsStore';

// Mock opencc-js 动态导入
const mockConverter = vi.fn((text: string) => {
  // 简单模拟：替换几个常见繁体字
  return text.replace(/設定/g, '设置').replace(/語言/g, '语言');
});

vi.mock('opencc-js', () => ({
  Converter: vi.fn(() => mockConverter),
}));

/** 测试用的包装组件，调用 hook 并渲染文字 */
const TestComponent = () => {
  useChineseConverter();
  return <div data-testid="content">設定 語言</div>;
};

describe('useChineseConverter', () => {
  beforeEach(() => {
    useSettingsStore.setState({ language: 'zh-TW' });
    document.documentElement.lang = '';
    // 清理 body
    document.body.innerHTML = '';
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('zh-TW 模式不触发转换', async () => {
    useSettingsStore.setState({ language: 'zh-TW' });
    await act(async () => {
      render(<TestComponent />);
    });
    // opencc-js 的 Converter 不应被调用（zh-TW 模式下不从 tw→cn）
    const OpenCC = await import('opencc-js');
    expect(OpenCC.Converter).not.toHaveBeenCalled();
  });

  it('zh-CN 模式触发 tw→cn 转换', async () => {
    useSettingsStore.setState({ language: 'zh-CN' });
    // 设置 lang 为 zh-CN 模拟已在 CN 模式
    document.documentElement.lang = 'zh-TW';
    document.body.innerHTML = '<div data-testid="content">設定 語言</div>';

    await act(async () => {
      render(<TestComponent />);
    });

    // 等待动态 import + DOM 遍历完成
    await new Promise(r => setTimeout(r, 100));

    const OpenCC = await import('opencc-js');
    expect(OpenCC.Converter).toHaveBeenCalledWith({ from: 'tw', to: 'cn' });
  });

  it('设置 document.documentElement.lang 为 zh-CN', async () => {
    useSettingsStore.setState({ language: 'zh-CN' });
    document.body.innerHTML = '<div>test</div>';

    await act(async () => {
      render(<TestComponent />);
    });

    await new Promise(r => setTimeout(r, 100));
    expect(document.documentElement.lang).toBe('zh-CN');
  });

  it('设置 document.documentElement.lang 为 zh-TW', async () => {
    useSettingsStore.setState({ language: 'zh-TW' });
    document.documentElement.lang = 'zh-CN'; // 模拟从 CN 切换过来

    await act(async () => {
      render(<TestComponent />);
    });

    await new Promise(r => setTimeout(r, 100));
    expect(document.documentElement.lang).toBe('zh-TW');
  });
});
