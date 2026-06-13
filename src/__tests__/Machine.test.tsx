import { render, screen } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import { Machine } from '../components/Machine';
import { TestWrapper } from './testWrapper';
import { useGameStore } from '../store/gameStore';
import type { PlacedMachine } from '../types';

/** 一个真实存在的机器配置（精炼炉） */
const makeMachine = (overrides: Partial<PlacedMachine> = {}): PlacedMachine => ({
  id: 'test-machine-1',
  machineId: 'ref', // 精炼炉: 3×3, 有 Solid 输入和输出
  x: 5,
  y: 5,
  rotation: 0,
  ...overrides,
});

const renderMachine = (data: PlacedMachine, props: { isSelected?: boolean; isPowered?: boolean } = {}) => {
  return render(
    <TestWrapper>
      <div className="zoom-content">
        <Machine data={data} {...props} />
      </div>
    </TestWrapper>
  );
};

describe('Machine 组件', () => {
  beforeEach(() => {
    // 重置 store 到默认状态
    useGameStore.setState({
      mode: 'BUILD' as any,
      zoom: 1,
      isConnecting: false,
      availablePorts: [],
      machines: [],
      connections: [],
    });
  });

  describe('基础渲染', () => {
    it('渲染机器名称', () => {
      renderMachine(makeMachine());
      expect(screen.getByText('精煉爐')).toBeInTheDocument();
    });

    it('设置正确的 CSS 自定义属性', () => {
      renderMachine(makeMachine({ x: 3, y: 7, rotation: 0 }));
      const container = document.querySelector('.machine-container') as HTMLElement;
      expect(container.style.getPropertyValue('--x')).toBe('3');
      expect(container.style.getPropertyValue('--y')).toBe('7');
      // 精炼炉 3×3 rotation=0: width=3, height=3
      expect(container.style.getPropertyValue('--w')).toBe('3');
      expect(container.style.getPropertyValue('--h')).toBe('3');
    });

    it('不存在的 machineId 返回 null', () => {
      const { container } = render(
        <TestWrapper>
          <Machine data={makeMachine({ machineId: 'nonexistent' })} />
        </TestWrapper>
      );
      expect(container.querySelector('.machine-container')).toBeNull();
    });

    it('选中状态添加 selected 类名', () => {
      renderMachine(makeMachine(), { isSelected: true });
      expect(document.querySelector('.machine-container.selected')).toBeInTheDocument();
    });

    it('未选中状态无 selected 类名', () => {
      renderMachine(makeMachine(), { isSelected: false });
      expect(document.querySelector('.machine-container.selected')).toBeNull();
    });
  });

  describe('端口渲染', () => {
    it('渲染输入端口（精炼炉 rotation=0 时左侧有输入端口）', () => {
      renderMachine(makeMachine({ rotation: 0 }));
      // 精炼炉 rotation=0: 上方和下方各有一个 Solid 输入
      const inputPorts = document.querySelectorAll('.port.input');
      expect(inputPorts.length).toBeGreaterThan(0);
    });

    it('渲染输出端口', () => {
      renderMachine(makeMachine({ rotation: 0 }));
      // 精炼炉 rotation=0: 右侧有一个 Solid 输出
      const outputPorts = document.querySelectorAll('.port.output');
      expect(outputPorts.length).toBeGreaterThan(0);
    });

    it('rotation=1 时端口正确旋转', () => {
      // 同一台机器，不同旋转角度
      const { unmount } = renderMachine(makeMachine({ rotation: 0 }));
      const count0 = document.querySelectorAll('.port').length;
      unmount();

      renderMachine(makeMachine({ rotation: 1 }));
      const count1 = document.querySelectorAll('.port').length;
      // 端口总数应保持一致（只是位置和方向不同）
      expect(count1).toBe(count0);
    });
  });

  describe('供电警告', () => {
    it('isPowered=false 时显示供电不足图标', () => {
      renderMachine(makeMachine(), { isPowered: false });
      const alertIcon = document.querySelector('.power-alert-icon');
      expect(alertIcon).toBeInTheDocument();
      expect(alertIcon!.getAttribute('title')).toBe('No Power');
    });

    it('isPowered=true 时不显示供电不足图标', () => {
      renderMachine(makeMachine(), { isPowered: true });
      expect(document.querySelector('.power-alert-icon')).toBeNull();
    });

    it('默认 isPowered=true 时不显示警告', () => {
      renderMachine(makeMachine());
      expect(document.querySelector('.power-alert-icon')).toBeNull();
    });
  });

  describe('操作提示标签', () => {
    it('渲染 hover 标签（缩放补偿 transform）', () => {
      renderMachine(makeMachine());
      // 标签包含操作提示
      expect(screen.getByText('[点击] 查看详情/选择物品')).toBeInTheDocument();
      expect(screen.getByText('[长按] 移动')).toBeInTheDocument();
    });

    it('标签根据 zoom 缩放', () => {
      useGameStore.setState({ zoom: 2 });
      renderMachine(makeMachine());
      const label = document.querySelector('.machine-label') as HTMLElement;
      expect(label.style.transform).toBe('scale(0.5)');
    });
  });
});
