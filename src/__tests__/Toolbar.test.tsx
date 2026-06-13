import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import { Toolbar } from '../components/Toolbar';
import { TestWrapper } from './testWrapper';
import { useGameStore } from '../store/gameStore';

const resetStore = () => {
  useGameStore.setState({
    mode: 'BUILD' as any,
    selectedMachineId: null,
    machines: [],
    connections: [],
    gridWidth: 24,
    gridHeight: 24,
  });
};

describe('Toolbar 组件', () => {
  beforeEach(resetStore);

  describe('模式切换按钮', () => {
    it('渲染 BUILD 模式按钮（指针图标）', () => {
      render(<TestWrapper><Toolbar /></TestWrapper>);
      expect(screen.getByTitle('Select / Move')).toBeInTheDocument();
    });

    it('渲染传送带模式按钮', () => {
      render(<TestWrapper><Toolbar /></TestWrapper>);
      expect(screen.getByTitle('传送带模式 (E)')).toBeInTheDocument();
    });

    it('渲染管道模式按钮', () => {
      render(<TestWrapper><Toolbar /></TestWrapper>);
      expect(screen.getByTitle('管道模式 (Q)')).toBeInTheDocument();
    });

    it('渲染框选模式按钮', () => {
      render(<TestWrapper><Toolbar /></TestWrapper>);
      expect(screen.getByTitle('Box Selection Mode (X)')).toBeInTheDocument();
    });

    it('点击传送带按钮切换到 CONVEYOR 模式', () => {
      render(<TestWrapper><Toolbar /></TestWrapper>);
      fireEvent.click(screen.getByTitle('传送带模式 (E)'));
      expect(useGameStore.getState().mode).toBe('CONVEYOR');
    });

    it('再次点击传送带按钮切回 BUILD 模式', () => {
      useGameStore.setState({ mode: 'CONVEYOR' as any });
      render(<TestWrapper><Toolbar /></TestWrapper>);
      fireEvent.click(screen.getByTitle('传送带模式 (E)'));
      expect(useGameStore.getState().mode).toBe('BUILD');
    });
  });

  describe('机器分类标签', () => {
    it('渲染全部 6 个分类标签', () => {
      render(<TestWrapper><Toolbar /></TestWrapper>);
      expect(screen.getByText('核心')).toBeInTheDocument();
      expect(screen.getByText('物流')).toBeInTheDocument();
      expect(screen.getByText('倉儲存取')).toBeInTheDocument();
      expect(screen.getByText('基礎生產')).toBeInTheDocument();
      expect(screen.getByText('合成製造')).toBeInTheDocument();
      expect(screen.getByText('電力')).toBeInTheDocument();
    });

    it('默认选中 production 分类，显示对应机器', () => {
      render(<TestWrapper><Toolbar /></TestWrapper>);
      // production 分类包含精炼炉（ref）
      // 机器名称可能因 onError 隐藏图片而只显示文字
      expect(screen.getByText('精煉爐')).toBeInTheDocument();
    });

    it('点击 core 分类切换机器列表', async () => {
      render(<TestWrapper><Toolbar /></TestWrapper>);
      const coreTab = screen.getByText('核心');
      fireEvent.click(coreTab);
      // Chakra Tabs (zag-js) 异步更新，等待一个微任务
      await new Promise(r => setTimeout(r, 0));
      // core 分类只有 pco（协议核心），应出现 '协议核心' 文字
      expect(screen.getByText('协议核心')).toBeInTheDocument();
    });
  });

  describe('机器选择', () => {
    it('点击机器按钮选中对应 machineId', () => {
      render(<TestWrapper><Toolbar /></TestWrapper>);
      // 默认 production 分类，ref 在其中
      fireEvent.click(screen.getByText('精煉爐'));
      expect(useGameStore.getState().selectedMachineId).toBe('ref');
    });

    it('点击指针按钮取消选择', () => {
      useGameStore.setState({ selectedMachineId: 'ref' });
      render(<TestWrapper><Toolbar /></TestWrapper>);
      fireEvent.click(screen.getByTitle('Select / Move'));
      expect(useGameStore.getState().selectedMachineId).toBeNull();
    });
  });

  describe('工具按钮高亮', () => {
    it('当前模式按钮高亮（active class）', () => {
      useGameStore.setState({ mode: 'CONVEYOR' as any });
      render(<TestWrapper><Toolbar /></TestWrapper>);
      const btn = screen.getByTitle('传送带模式 (E)');
      expect(btn.className).toContain('active');
    });

    it('选中的机器按钮高亮', () => {
      useGameStore.setState({ selectedMachineId: 'ref' });
      render(<TestWrapper><Toolbar /></TestWrapper>);
      // ref 按钮应该有 active class
      const buttons = document.querySelectorAll('.machine-btn.active');
      expect(buttons.length).toBeGreaterThanOrEqual(1);
    });
  });
});
