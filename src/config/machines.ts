import type { Direction, MachineConfig } from '@/types';
import { MASK_SOLID_LOGISTICS, MASK_LIQUID_LOGISTICS, MASK_REGULAR_MACHINE } from '@/types';
import { Mask } from '@/utils/mask';
/*顺序：
协议核心
物流桥，分流器，汇流器，物品准入口，管道桥，管道分流器，管道汇流器，管道准入口，
协议储存箱，仓库存货口，仓库取货口，储液罐，仓库存取线基段，仓库存取线源桩，暗管入口，暗管出口，多口暗管入口，多口暗管出口，
精炼炉，精炼炉（液体），粉碎机，配件机，塑形机，采种机，种植机，种植机（液体），废水处理机，
装备原件机，灌装机，封装机，研磨机，反应池，扩容反应池，天有洪炉，提纯机，拆解机，
供电桩，息壤供电桩，中继器，息壤中继器，热能池
*/
// 模版：{ x: , y: , side: '', type: '', autoConnect: },
// 端口排序，通常先上下再左右
export const MACHINES: MachineConfig[] = [
    {    // 协议核心 protocol-core pco
        id: 'pco',
        name: '协议核心',
        power: 0,
        supplyDistance: 0,
        width: 9,
        height: 9,
        inputs: [
            { x: 0, y: 1, side: 'left', type: 'Solid', autoConnect: false },
            { x: 0, y: 2, side: 'left', type: 'Solid', autoConnect: false },
            { x: 0, y: 3, side: 'left', type: 'Solid', autoConnect: false },
            { x: 0, y: 4, side: 'left', type: 'Solid', autoConnect: false },
            { x: 0, y: 5, side: 'left', type: 'Solid', autoConnect: false },
            { x: 0, y: 6, side: 'left', type: 'Solid', autoConnect: false },
            { x: 0, y: 7, side: 'left', type: 'Solid', autoConnect: false },
            { x: 8, y: 1, side: 'right', type: 'Solid', autoConnect: false },
            { x: 8, y: 2, side: 'right', type: 'Solid', autoConnect: false },
            { x: 8, y: 3, side: 'right', type: 'Solid', autoConnect: false },
            { x: 8, y: 4, side: 'right', type: 'Solid', autoConnect: false },
            { x: 8, y: 5, side: 'right', type: 'Solid', autoConnect: false },
            { x: 8, y: 6, side: 'right', type: 'Solid', autoConnect: false },
            { x: 8, y: 7, side: 'right', type: 'Solid', autoConnect: false }
        ],
        outputs: [
            { x: 1, y: 0, side: 'top', type: 'Solid', autoConnect: false },
            { x: 4, y: 0, side: 'top', type: 'Solid', autoConnect: false },
            { x: 7, y: 0, side: 'top', type: 'Solid', autoConnect: false },
            { x: 1, y: 8, side: 'bottom', type: 'Solid', autoConnect: false },
            { x: 4, y: 8, side: 'bottom', type: 'Solid', autoConnect: false },
            { x: 7, y: 8, side: 'bottom', type: 'Solid', autoConnect: false }
        ],
        mask: Mask.Uniform(9, 9, MASK_REGULAR_MACHINE),
        color: 'rgba(255, 255, 255, 0.3)',
    }, { // 物流桥 logistics-bridge lbr
        id: 'lbr',
        name: '物流橋',
        power: 0,
        supplyDistance: 0,
        width: 1,
        height: 1,
        inputs: [
            { x: 0, y: 0, side: 'top', type: 'Solid', autoConnect: true },
            { x: 0, y: 0, side: 'right', type: 'Solid', autoConnect: true },
            { x: 0, y: 0, side: 'bottom', type: 'Solid', autoConnect: true },
            { x: 0, y: 0, side: 'left', type: 'Solid', autoConnect: true }
        ],
        outputs: [
            { x: 0, y: 0, side: 'top', type: 'Solid', autoConnect: true },
            { x: 0, y: 0, side: 'right', type: 'Solid', autoConnect: true },
            { x: 0, y: 0, side: 'bottom', type: 'Solid', autoConnect: true },
            { x: 0, y: 0, side: 'left', type: 'Solid', autoConnect: true }
        ],
        mask: Mask.Uniform(1, 1, MASK_SOLID_LOGISTICS),
        color: 'rgba(255, 255, 255, 0.3)',
    }, { // 分流器 splitter spl
        id: 'spl',
        name: '分流器',
        power: 0,
        supplyDistance: 0,
        width: 1,
        height: 1,
        inputs: [
            { x: 0, y: 0, side: 'top', type: 'Solid', autoConnect: true }
        ],
        outputs: [
            { x: 0, y: 0, side: 'right', type: 'Solid', autoConnect: true },
            { x: 0, y: 0, side: 'bottom', type: 'Solid', autoConnect: true },
            { x: 0, y: 0, side: 'left', type: 'Solid', autoConnect: true }
        ],
        mask: Mask.Uniform(1, 1, MASK_SOLID_LOGISTICS),
        color: 'rgba(255, 255, 255, 0.3)',
    }, { // 汇流器 merger mrg
        id: 'mrg',
        name: '匯流器',
        power: 0,
        supplyDistance: 0,
        width: 1,
        height: 1,
        inputs: [
            { x: 0, y: 0, side: 'left', type: 'Solid', autoConnect: true },
            { x: 0, y: 0, side: 'top', type: 'Solid', autoConnect: true },
            { x: 0, y: 0, side: 'right', type: 'Solid', autoConnect: true }
        ],
        outputs: [
            { x: 0, y: 0, side: 'bottom', type: 'Solid', autoConnect: true }
        ],
        mask: Mask.Uniform(1, 1, MASK_SOLID_LOGISTICS),
        color: 'rgba(255, 255, 255, 0.3)',
    }, { // 物品准入口 item-input-port iip
        id: 'iip',
        name: '物品准入口',
        power: 0,
        supplyDistance: 0,
        width: 1,
        height: 1,
        inputs: [
            { x: 0, y: 0, side: 'top', type: 'Solid', autoConnect: true }
        ],
        outputs: [
            { x: 0, y: 0, side: 'bottom', type: 'Solid', autoConnect: true }
        ],
        mask: Mask.Uniform(1, 1, MASK_SOLID_LOGISTICS),
        color: 'rgba(255, 255, 255, 0.3)',
    }, { // 管道桥 pipe-bridge pbr
        id: 'pbr',
        name: '管道橋',
        power: 0,
        supplyDistance: 0,
        width: 1,
        height: 1,
        inputs: [
            { x: 0, y: 0, side: 'top', type: 'Liquid', autoConnect: true },
            { x: 0, y: 0, side: 'right', type: 'Liquid', autoConnect: true },
            { x: 0, y: 0, side: 'bottom', type: 'Liquid', autoConnect: true },
            { x: 0, y: 0, side: 'left', type: 'Liquid', autoConnect: true }
        ],
        outputs: [
            { x: 0, y: 0, side: 'top', type: 'Liquid', autoConnect: true },
            { x: 0, y: 0, side: 'right', type: 'Liquid', autoConnect: true },
            { x: 0, y: 0, side: 'bottom', type: 'Liquid', autoConnect: true },
            { x: 0, y: 0, side: 'left', type: 'Liquid', autoConnect: true }
        ],
        mask: Mask.Uniform(1, 1, MASK_LIQUID_LOGISTICS),
        color: 'rgba(255, 255, 255, 0.3)',
    }, { // 管道分流器 pipe-splitter psp
        id: 'psp',
        name: '管道分流器',
        power: 0,
        supplyDistance: 0,
        width: 1,
        height: 1,
        inputs: [
            { x: 0, y: 0, side: 'top', type: 'Liquid', autoConnect: true }
        ],
        outputs: [
            { x: 0, y: 0, side: 'right', type: 'Liquid', autoConnect: true },
            { x: 0, y: 0, side: 'bottom', type: 'Liquid', autoConnect: true },
            { x: 0, y: 0, side: 'left', type: 'Liquid', autoConnect: true }
        ],
        mask: Mask.Uniform(1, 1, MASK_LIQUID_LOGISTICS),
        color: 'rgba(255, 255, 255, 0.3)',
    }, { // 管道汇流器 pipe-merger pmg
        id: 'pmg',
        name: '管道匯流器',
        power: 0,
        supplyDistance: 0,
        width: 1,
        height: 1,
        inputs: [
            { x: 0, y: 0, side: 'left', type: 'Liquid', autoConnect: true },
            { x: 0, y: 0, side: 'top', type: 'Liquid', autoConnect: true },
            { x: 0, y: 0, side: 'right', type: 'Liquid', autoConnect: true }
        ],
        outputs: [
            { x: 0, y: 0, side: 'bottom', type: 'Liquid', autoConnect: true }
        ],
        mask: Mask.Uniform(1, 1, MASK_LIQUID_LOGISTICS),
        color: 'rgba(255, 255, 255, 0.3)',
    }, { // 管道准入口 pipe-input-port pip
        id: 'pip',
        name: '管道准入口',
        power: 0,
        supplyDistance: 0,
        width: 1,
        height: 1,
        inputs: [
            { x: 0, y: 0, side: 'top', type: 'Liquid', autoConnect: true }
        ],
        outputs: [
            { x: 0, y: 0, side: 'bottom', type: 'Liquid', autoConnect: true }
        ],
        mask: Mask.Uniform(1, 1, MASK_LIQUID_LOGISTICS),
        color: 'rgba(255, 255, 255, 0.3)',
    }, { // 协议储存箱 protocol-storage pst
        id: 'pst',
        name: '協議儲存箱',
        power: 5,
        supplyDistance: 0,
        width: 3,
        height: 3,
        inputs: [
            { x: 0, y: 0, side: 'top', type: 'Solid', autoConnect: false },
            { x: 1, y: 0, side: 'top', type: 'Solid', autoConnect: false },
            { x: 2, y: 0, side: 'top', type: 'Solid', autoConnect: false }
        ],
        outputs: [
            { x: 0, y: 2, side: 'bottom', type: 'Solid', autoConnect: false },
            { x: 1, y: 2, side: 'bottom', type: 'Solid', autoConnect: false },
            { x: 2, y: 2, side: 'bottom', type: 'Solid', autoConnect: false }
        ],
        mask: Mask.Uniform(3, 3, MASK_REGULAR_MACHINE),
        color: 'rgba(255, 255, 255, 0.3)',
    }, { // 仓库存货口 warehouse-storage-port wsp
        id: 'wsp',
        name: '倉庫存貨口',
        power: 0,
        supplyDistance: 0,
        width: 3,
        height: 1,
        inputs: [
            { x: 1, y: 0, side: 'top', type: 'Solid', autoConnect: false }
        ],
        outputs: [],
        mask: Mask.Uniform(3, 1, MASK_REGULAR_MACHINE),
        color: 'rgba(255, 255, 255, 0.3)',
    }, { // 仓库取货口 warehouse-pickup-port wpp
        id: 'wpp',
        name: '倉庫取貨口',
        power: 0,
        supplyDistance: 0,
        width: 3,
        height: 1,
        inputs: [],
        outputs: [
            { x: 1, y: 0, side: 'bottom', type: 'Solid', autoConnect: false }
        ],
        mask: Mask.Uniform(3, 1, MASK_REGULAR_MACHINE),
        color: 'rgba(255, 255, 255, 0.3)',
    }, { // 储液罐 liquid-tank ltk
        id: 'ltk',
        name: '儲液罐',
        power: 0,
        supplyDistance: 0,
        width: 3,
        height: 3,
        inputs: [
            { x: 1, y: 0, side: 'top', type: 'Liquid', autoConnect: false }
        ],
        outputs: [
            { x: 1, y: 2, side: 'bottom', type: 'Liquid', autoConnect: false },
        ],
        mask: Mask.Uniform(3, 3, MASK_REGULAR_MACHINE),
        color: 'rgba(170, 221, 255, 0.3)',
    }, { // 仓库存取线基段 warehouse-storage-pickup-line-segment wss
        id: 'wss',
        name: '倉庫存取線基段',
        power: 0,
        supplyDistance: 0,
        width: 8,
        height: 4,
        inputs: [],
        outputs: [],
        mask: Mask.Uniform(8, 4, MASK_REGULAR_MACHINE),
        color: 'rgba(255, 255, 255, 0.3)',
    }, { // 仓库存取线源桩 warehouse-storage-pickup-line-source-pile wsl
        id: 'wsl',
        name: '倉庫存取線源樁',
        power: 0,
        supplyDistance: 0,
        width: 4,
        height: 4,
        inputs: [],
        outputs: [],
        mask: Mask.Uniform(4, 4, MASK_REGULAR_MACHINE),
        color: 'rgba(255, 255, 255, 0.3)',
    }, { // 暗管入口 concealed-pipe-entrance cpe
        id: 'cpe',
        name: '暗管入口',
        power: 0,
        supplyDistance: 0,
        width: 3,
        height: 3,
        inputs: [
            { x: 1, y: 0, side: 'top', type: 'Liquid', autoConnect: false }
        ],
        outputs: [],
        mask: Mask.Uniform(3, 3, MASK_LIQUID_LOGISTICS),
        color: 'rgba(255, 255, 255, 0.3)',
    }, { // 暗管出口 concealed-pipe-exit cpx
        id: 'cpx',
        name: '暗管出口',
        power: 0,
        supplyDistance: 0,
        width: 3,
        height: 3,
        inputs: [],
        outputs: [
            { x: 1, y: 2, side: 'bottom', type: 'Liquid', autoConnect: false }
        ],
        mask: Mask.Uniform(3, 3, MASK_LIQUID_LOGISTICS),
        color: 'rgba(255, 255, 255, 0.3)',
    }, { // 多口暗管入口 multi-concealed-pipe-entrance mce
        id: 'mce',
        name: '多口暗管入口',
        power: 0,
        supplyDistance: 0,
        width: 5,
        height: 3,
        inputs: [
            { x: 1, y: 0, side: 'top', type: 'Liquid', autoConnect: false },
            { x: 3, y: 0, side: 'top', type: 'Liquid', autoConnect: false }
        ],
        outputs: [],
        mask: Mask.Uniform(5, 3, MASK_LIQUID_LOGISTICS),
        color: 'rgba(255, 255, 255, 0.3)',
    }, { // 多口暗管出口 multi-concealed-pipe-exit mcx
        id: 'mcx',
        name: '多口暗管出口',
        power: 0,
        supplyDistance: 0,
        width: 5,
        height: 3,
        inputs: [],
        outputs: [
            { x: 1, y: 2, side: 'bottom', type: 'Liquid', autoConnect: false },
            { x: 3, y: 2, side: 'bottom', type: 'Liquid', autoConnect: false }
        ],
        mask: Mask.Uniform(5, 3, MASK_LIQUID_LOGISTICS),
        color: 'rgba(255, 255, 255, 0.3)',
    }, { // 精炼炉 refinery ref
        id: 'ref',
        name: '精煉爐',
        power: 5,
        supplyDistance: 0,
        width: 3,
        height: 3,
        inputs: [
            { x: 0, y: 0, side: 'top', type: 'Solid', autoConnect: false },
            { x: 1, y: 0, side: 'top', type: 'Solid', autoConnect: false },
            { x: 2, y: 0, side: 'top', type: 'Solid', autoConnect: false }
        ],
        outputs: [
            { x: 0, y: 2, side: 'bottom', type: 'Solid', autoConnect: false },
            { x: 1, y: 2, side: 'bottom', type: 'Solid', autoConnect: false },
            { x: 2, y: 2, side: 'bottom', type: 'Solid', autoConnect: false }
        ],
        mask: Mask.Uniform(3, 3, MASK_REGULAR_MACHINE),
        color: 'rgba(170, 221, 255, 0.3)',
    }, { // 精炼炉（液体） refinery liquid rfl
        id: 'rfl',
        name: '精煉爐（液体）',
        power: 5,
        supplyDistance: 0,
        width: 3,
        height: 3,
        inputs: [
            { x: 0, y: 0, side: 'top', type: 'Solid', autoConnect: false },
            { x: 1, y: 0, side: 'top', type: 'Solid', autoConnect: false },
            { x: 2, y: 0, side: 'top', type: 'Solid', autoConnect: false },
            { x: 0, y: 1, side: 'left', type: 'Liquid', autoConnect: false },
        ],
        outputs: [
            { x: 0, y: 2, side: 'bottom', type: 'Solid', autoConnect: false },
            { x: 1, y: 2, side: 'bottom', type: 'Solid', autoConnect: false },
            { x: 2, y: 2, side: 'bottom', type: 'Solid', autoConnect: false },
            { x: 2, y: 1, side: 'right', type: 'Liquid', autoConnect: false },
        ],
        mask: Mask.Uniform(3, 3, MASK_REGULAR_MACHINE),
        color: 'rgba(170, 221, 255, 0.3)',
    }, { // 粉碎机 crusher cru
        id: 'cru',
        name: '粉碎機',
        power: 5,
        supplyDistance: 0,
        width: 3,
        height: 3,
        inputs: [
            { x: 0, y: 0, side: 'top', type: 'Solid', autoConnect: false },
            { x: 1, y: 0, side: 'top', type: 'Solid', autoConnect: false },
            { x: 2, y: 0, side: 'top', type: 'Solid', autoConnect: false }
        ],
        outputs: [
            { x: 0, y: 2, side: 'bottom', type: 'Solid', autoConnect: false },
            { x: 1, y: 2, side: 'bottom', type: 'Solid', autoConnect: false },
            { x: 2, y: 2, side: 'bottom', type: 'Solid', autoConnect: false }
        ],
        mask: Mask.Uniform(3, 3, MASK_REGULAR_MACHINE),
        color: 'rgba(255, 170, 136, 0.3)',
    }, { // 配件机 assembler asm
        id: 'asm',
        name: '配件機',
        power: 20,
        supplyDistance: 0,
        width: 3,
        height: 3,
        inputs: [
            { x: 0, y: 0, side: 'top', type: 'Solid', autoConnect: false },
            { x: 1, y: 0, side: 'top', type: 'Solid', autoConnect: false },
            { x: 2, y: 0, side: 'top', type: 'Solid', autoConnect: false }
        ],
        outputs: [
            { x: 0, y: 2, side: 'bottom', type: 'Solid', autoConnect: false },
            { x: 1, y: 2, side: 'bottom', type: 'Solid', autoConnect: false },
            { x: 2, y: 2, side: 'bottom', type: 'Solid', autoConnect: false }
        ],
        mask: Mask.Uniform(3, 3, MASK_REGULAR_MACHINE),
        color: 'rgba(204, 136, 255, 0.3)',
    }, { // 塑形机 molder mol
        id: 'mol',
        name: '塑型機',
        power: 10,
        supplyDistance: 0,
        width: 3,
        height: 3,
        inputs: [
            { x: 0, y: 0, side: 'top', type: 'Solid', autoConnect: false },
            { x: 1, y: 0, side: 'top', type: 'Solid', autoConnect: false },
            { x: 2, y: 0, side: 'top', type: 'Solid', autoConnect: false }
        ],
        outputs: [
            { x: 0, y: 2, side: 'bottom', type: 'Solid', autoConnect: false },
            { x: 1, y: 2, side: 'bottom', type: 'Solid', autoConnect: false },
            { x: 2, y: 2, side: 'bottom', type: 'Solid', autoConnect: false }
        ],
        mask: Mask.Uniform(3, 3, MASK_REGULAR_MACHINE),
        color: 'rgba(255, 136, 136, 0.3)',
    }, { // 采种机 seedHarvester shv
        id: 'shv',
        name: '採種機',
        power: 10,
        supplyDistance: 0,
        width: 5,
        height: 5,
        inputs: [
            { x: 0, y: 0, side: 'top', type: 'Solid', autoConnect: false },
            { x: 1, y: 0, side: 'top', type: 'Solid', autoConnect: false },
            { x: 2, y: 0, side: 'top', type: 'Solid', autoConnect: false },
            { x: 3, y: 0, side: 'top', type: 'Solid', autoConnect: false },
            { x: 4, y: 0, side: 'top', type: 'Solid', autoConnect: false }
        ],
        outputs: [
            { x: 0, y: 4, side: 'bottom', type: 'Solid', autoConnect: false },
            { x: 1, y: 4, side: 'bottom', type: 'Solid', autoConnect: false },
            { x: 2, y: 4, side: 'bottom', type: 'Solid', autoConnect: false },
            { x: 3, y: 4, side: 'bottom', type: 'Solid', autoConnect: false },
            { x: 4, y: 4, side: 'bottom', type: 'Solid', autoConnect: false }
        ],
        mask: Mask.Uniform(5, 5, MASK_REGULAR_MACHINE),
        color: 'rgba(209, 230, 209, 0.3)',
    }, { // 种植机 planter pln
        id: 'pln',
        name: '種植機',
        power: 20,
        supplyDistance: 0,
        width: 5,
        height: 5,
        inputs: [
            { x: 0, y: 0, side: 'top', type: 'Solid', autoConnect: false },
            { x: 1, y: 0, side: 'top', type: 'Solid', autoConnect: false },
            { x: 2, y: 0, side: 'top', type: 'Solid', autoConnect: false },
            { x: 3, y: 0, side: 'top', type: 'Solid', autoConnect: false },
            { x: 4, y: 0, side: 'top', type: 'Solid', autoConnect: false }
        ],
        outputs: [
            { x: 0, y: 4, side: 'bottom', type: 'Solid', autoConnect: false },
            { x: 1, y: 4, side: 'bottom', type: 'Solid', autoConnect: false },
            { x: 2, y: 4, side: 'bottom', type: 'Solid', autoConnect: false },
            { x: 3, y: 4, side: 'bottom', type: 'Solid', autoConnect: false },
            { x: 4, y: 4, side: 'bottom', type: 'Solid', autoConnect: false }
        ],
        mask: Mask.Uniform(5, 5, MASK_REGULAR_MACHINE),
        color: 'rgba(255, 136, 136, 0.3)',
    }, { // 种植机（液体） planter liquid pll
        id: 'pll',
        name: '种植机（液体）',
        power: 20,
        supplyDistance: 0,
        width: 5,
        height: 5,
        inputs: [
            { x: 0, y: 0, side: 'top', type: 'Solid', autoConnect: false },
            { x: 1, y: 0, side: 'top', type: 'Solid', autoConnect: false },
            { x: 2, y: 0, side: 'top', type: 'Solid', autoConnect: false },
            { x: 3, y: 0, side: 'top', type: 'Solid', autoConnect: false },
            { x: 4, y: 0, side: 'top', type: 'Solid', autoConnect: false },
            { x: 0, y: 2, side: 'left', type: 'Liquid', autoConnect: false }
        ],
        outputs: [
            { x: 0, y: 4, side: 'bottom', type: 'Solid', autoConnect: false },
            { x: 1, y: 4, side: 'bottom', type: 'Solid', autoConnect: false },
            { x: 2, y: 4, side: 'bottom', type: 'Solid', autoConnect: false },
            { x: 3, y: 4, side: 'bottom', type: 'Solid', autoConnect: false },
            { x: 4, y: 4, side: 'bottom', type: 'Solid', autoConnect: false }
        ],
        mask: Mask.Uniform(5, 5, MASK_REGULAR_MACHINE),
        color: 'rgba(255, 136, 136, 0.3)',
    }, { // 废水处理机 wastewater-treatment wwt
        id: 'wwt',
        name: '廢水處理機',
        power: 50,
        supplyDistance: 0,
        width: 3,
        height: 3,
        inputs: [{ x: 1, y: 0, side: 'top', type: 'Liquid', autoConnect: false }],
        outputs: [],
        mask: Mask.Uniform(3, 3, MASK_REGULAR_MACHINE),
        color: 'rgba(136, 204, 170, 0.3)',
    }, { // 装备原件机 component-assembler cas
        id: 'cas',
        name: '裝備原件機',
        power: 10,
        supplyDistance: 0,
        width: 6,
        height: 4,
        inputs: [
            { x: 0, y: 0, side: 'top', type: 'Solid', autoConnect: false },
            { x: 1, y: 0, side: 'top', type: 'Solid', autoConnect: false },
            { x: 2, y: 0, side: 'top', type: 'Solid', autoConnect: false },
            { x: 3, y: 0, side: 'top', type: 'Solid', autoConnect: false },
            { x: 4, y: 0, side: 'top', type: 'Solid', autoConnect: false },
            { x: 5, y: 0, side: 'top', type: 'Solid', autoConnect: false }
        ],
        outputs: [
            { x: 0, y: 3, side: 'bottom', type: 'Solid', autoConnect: false },
            { x: 1, y: 3, side: 'bottom', type: 'Solid', autoConnect: false },
            { x: 2, y: 3, side: 'bottom', type: 'Solid', autoConnect: false },
            { x: 3, y: 3, side: 'bottom', type: 'Solid', autoConnect: false },
            { x: 4, y: 3, side: 'bottom', type: 'Solid', autoConnect: false },
            { x: 5, y: 3, side: 'bottom', type: 'Solid', autoConnect: false }
        ],
        mask: Mask.Uniform(6, 4, MASK_REGULAR_MACHINE),
        color: 'rgba(255, 136, 204, 0.3)',
    }, { // 灌装机 filler fil
        id: 'fil',
        name: '灌裝機',
        power: 20,
        supplyDistance: 0,
        width: 6,
        height: 4,
        inputs: [
            { x: 0, y: 0, side: 'top', type: 'Solid', autoConnect: false },
            { x: 1, y: 0, side: 'top', type: 'Solid', autoConnect: false },
            { x: 2, y: 0, side: 'top', type: 'Solid', autoConnect: false },
            { x: 3, y: 0, side: 'top', type: 'Solid', autoConnect: false },
            { x: 4, y: 0, side: 'top', type: 'Solid', autoConnect: false },
            { x: 5, y: 0, side: 'top', type: 'Solid', autoConnect: false }
        ],
        outputs: [
            { x: 0, y: 3, side: 'bottom', type: 'Solid', autoConnect: false },
            { x: 1, y: 3, side: 'bottom', type: 'Solid', autoConnect: false },
            { x: 2, y: 3, side: 'bottom', type: 'Solid', autoConnect: false },
            { x: 3, y: 3, side: 'bottom', type: 'Solid', autoConnect: false },
            { x: 4, y: 3, side: 'bottom', type: 'Solid', autoConnect: false },
            { x: 5, y: 3, side: 'bottom', type: 'Solid', autoConnect: false }
        ],
        mask: Mask.Uniform(6, 4, MASK_REGULAR_MACHINE),
        color: 'rgba(255, 255, 255, 0.3)',
    }, { // 灌装机（液体） filler liquid fll
        id: 'fll',
        name: '灌裝機（液体）',
        power: 20,
        supplyDistance: 0,
        width: 6,
        height: 4,
        inputs: [
            { x: 0, y: 0, side: 'top', type: 'Solid', autoConnect: false },
            { x: 1, y: 0, side: 'top', type: 'Solid', autoConnect: false },
            { x: 2, y: 0, side: 'top', type: 'Solid', autoConnect: false },
            { x: 3, y: 0, side: 'top', type: 'Solid', autoConnect: false },
            { x: 4, y: 0, side: 'top', type: 'Solid', autoConnect: false },
            { x: 5, y: 0, side: 'top', type: 'Solid', autoConnect: false },
            { x: 0, y: 1, side: 'left', type: 'Liquid', autoConnect: false }
        ],
        outputs: [
            { x: 0, y: 3, side: 'bottom', type: 'Solid', autoConnect: false },
            { x: 1, y: 3, side: 'bottom', type: 'Solid', autoConnect: false },
            { x: 2, y: 3, side: 'bottom', type: 'Solid', autoConnect: false },
            { x: 3, y: 3, side: 'bottom', type: 'Solid', autoConnect: false },
            { x: 4, y: 3, side: 'bottom', type: 'Solid', autoConnect: false },
            { x: 5, y: 3, side: 'bottom', type: 'Solid', autoConnect: false }
        ],
        mask: Mask.Uniform(6, 4, MASK_REGULAR_MACHINE),
        color: 'rgba(255, 255, 255, 0.3)',
    }, { // 封装机 sealer sel
        id: 'sel',
        name: '封裝機',
        power: 20,
        supplyDistance: 0,
        width: 6,
        height: 4,
        inputs: [
            { x: 0, y: 0, side: 'top', type: 'Solid', autoConnect: false },
            { x: 1, y: 0, side: 'top', type: 'Solid', autoConnect: false },
            { x: 2, y: 0, side: 'top', type: 'Solid', autoConnect: false },
            { x: 3, y: 0, side: 'top', type: 'Solid', autoConnect: false },
            { x: 4, y: 0, side: 'top', type: 'Solid', autoConnect: false },
            { x: 5, y: 0, side: 'top', type: 'Solid', autoConnect: false }
        ],
        outputs: [
            { x: 0, y: 3, side: 'bottom', type: 'Solid', autoConnect: false },
            { x: 1, y: 3, side: 'bottom', type: 'Solid', autoConnect: false },
            { x: 2, y: 3, side: 'bottom', type: 'Solid', autoConnect: false },
            { x: 3, y: 3, side: 'bottom', type: 'Solid', autoConnect: false },
            { x: 4, y: 3, side: 'bottom', type: 'Solid', autoConnect: false },
            { x: 5, y: 3, side: 'bottom', type: 'Solid', autoConnect: false }
        ],
        mask: Mask.Uniform(6, 4, MASK_REGULAR_MACHINE),
        color: 'rgba(255, 255, 255, 0.3)',
    }, { // 研磨机 grinder grn
        id: 'grn',
        name: '研磨機',
        power: 50,
        supplyDistance: 0,
        width: 6,
        height: 4,
        inputs: [
            { x: 0, y: 0, side: 'top', type: 'Solid', autoConnect: false },
            { x: 1, y: 0, side: 'top', type: 'Solid', autoConnect: false },
            { x: 2, y: 0, side: 'top', type: 'Solid', autoConnect: false },
            { x: 3, y: 0, side: 'top', type: 'Solid', autoConnect: false },
            { x: 4, y: 0, side: 'top', type: 'Solid', autoConnect: false },
            { x: 5, y: 0, side: 'top', type: 'Solid', autoConnect: false }
        ],
        outputs: [
            { x: 0, y: 3, side: 'bottom', type: 'Solid', autoConnect: false },
            { x: 1, y: 3, side: 'bottom', type: 'Solid', autoConnect: false },
            { x: 2, y: 3, side: 'bottom', type: 'Solid', autoConnect: false },
            { x: 3, y: 3, side: 'bottom', type: 'Solid', autoConnect: false },
            { x: 4, y: 3, side: 'bottom', type: 'Solid', autoConnect: false },
            { x: 5, y: 3, side: 'bottom', type: 'Solid', autoConnect: false }
        ],
        mask: Mask.Uniform(6, 4, MASK_REGULAR_MACHINE),
        color: 'rgba(255, 255, 255, 0.3)',
    }, { // 反应池 reactor rea
        id: 'rea',
        name: '反應池',
        power: 50,
        supplyDistance: 0,
        width: 5,
        height: 5,
        inputs: [
            { x: 1, y: 0, side: 'top', type: 'Solid', autoConnect: false },
            { x: 3, y: 0, side: 'top', type: 'Solid', autoConnect: false },
            { x: 0, y: 1, side: 'left', type: 'Liquid', autoConnect: false },
            { x: 0, y: 3, side: 'left', type: 'Liquid', autoConnect: false },
        ],
        outputs: [
            { x: 1, y: 4, side: 'bottom', type: 'Solid', autoConnect: false },
            { x: 3, y: 4, side: 'bottom', type: 'Solid', autoConnect: false },
            { x: 4, y: 1, side: 'right', type: 'Liquid', autoConnect: false },
            { x: 4, y: 3, side: 'right', type: 'Liquid', autoConnect: false },
        ],
        mask: Mask.Uniform(5, 5, MASK_REGULAR_MACHINE),
        color: 'rgba(255, 255, 255, 0.3)',
    }, { // 扩容反应池 expanded-reactor era
        id: 'era',
        name: '擴容反應池',
        power: 100,
        supplyDistance: 0,
        width: 6,
        height: 5,
        inputs: [
            { x: 1, y: 0, side: 'top', type: 'Solid', autoConnect: false },
            { x: 2, y: 0, side: 'top', type: 'Solid', autoConnect: false },
            { x: 3, y: 0, side: 'top', type: 'Solid', autoConnect: false },
            { x: 4, y: 0, side: 'top', type: 'Solid', autoConnect: false },
            { x: 0, y: 1, side: 'left', type: 'Liquid', autoConnect: false },
            { x: 0, y: 3, side: 'left', type: 'Liquid', autoConnect: false },
        ],
        outputs: [
            { x: 1, y: 4, side: 'bottom', type: 'Solid', autoConnect: false },
            { x: 2, y: 4, side: 'bottom', type: 'Solid', autoConnect: false },
            { x: 3, y: 4, side: 'bottom', type: 'Solid', autoConnect: false },
            { x: 4, y: 4, side: 'bottom', type: 'Solid', autoConnect: false },
            { x: 5, y: 1, side: 'right', type: 'Liquid', autoConnect: false },
            { x: 5, y: 3, side: 'right', type: 'Liquid', autoConnect: false },
        ],
        mask: Mask.Uniform(6, 5, MASK_REGULAR_MACHINE),
        color: 'rgba(255, 255, 255, 0.3)',
    }, { // 天有洪炉 tian-you-hong-furnace tyh
        id: 'tyh',
        name: '天有洪爐',
        power: 50,
        supplyDistance: 0,
        width: 5,
        height: 5,
        inputs: [
            { x: 0, y: 0, side: 'top', type: 'Solid', autoConnect: false },
            { x: 1, y: 0, side: 'top', type: 'Solid', autoConnect: false },
            { x: 2, y: 0, side: 'top', type: 'Solid', autoConnect: false },
            { x: 3, y: 0, side: 'top', type: 'Solid', autoConnect: false },
            { x: 4, y: 0, side: 'top', type: 'Solid', autoConnect: false },
            { x: 0, y: 2, side: 'left', type: 'Liquid', autoConnect: false }
        ],
        outputs: [
            { x: 0, y: 4, side: 'bottom', type: 'Solid', autoConnect: false },
            { x: 1, y: 4, side: 'bottom', type: 'Solid', autoConnect: false },
            { x: 2, y: 4, side: 'bottom', type: 'Solid', autoConnect: false },
            { x: 3, y: 4, side: 'bottom', type: 'Solid', autoConnect: false },
            { x: 4, y: 4, side: 'bottom', type: 'Solid', autoConnect: false }
        ],
        mask: Mask.Uniform(5, 5, MASK_REGULAR_MACHINE),
        color: 'rgba(255, 255, 255, 0.3)',
    }, { // 提纯机 purifier pur
        id: 'pur',
        name: '提純機',
        power: 50,
        supplyDistance: 0,
        width: 5,
        height: 5,
        inputs: [
            { x: 1, y: 0, side: 'top', type: 'Liquid', autoConnect: false },
            { x: 3, y: 0, side: 'top', type: 'Liquid', autoConnect: false }
        ],
        outputs: [
            { x: 1, y: 4, side: 'bottom', type: 'Liquid', autoConnect: false },
            { x: 3, y: 4, side: 'bottom', type: 'Liquid', autoConnect: false }
        ],
        mask: Mask.Uniform(5, 5, MASK_REGULAR_MACHINE),
        color: 'rgba(255, 255, 255, 0.3)',
    }, { // 拆解机 disassembler dis
        id: 'dis',
        name: '拆解機',
        power: 20,
        supplyDistance: 0,
        width: 6,
        height: 4,
        inputs: [
            { x: 0, y: 0, side: 'top', type: 'Solid', autoConnect: false },
            { x: 1, y: 0, side: 'top', type: 'Solid', autoConnect: false },
            { x: 2, y: 0, side: 'top', type: 'Solid', autoConnect: false },
            { x: 3, y: 0, side: 'top', type: 'Solid', autoConnect: false },
            { x: 4, y: 0, side: 'top', type: 'Solid', autoConnect: false },
            { x: 5, y: 0, side: 'top', type: 'Solid', autoConnect: false }
        ],
        outputs: [
            { x: 0, y: 3, side: 'bottom', type: 'Solid', autoConnect: false },
            { x: 1, y: 3, side: 'bottom', type: 'Solid', autoConnect: false },
            { x: 2, y: 3, side: 'bottom', type: 'Solid', autoConnect: false },
            { x: 3, y: 3, side: 'bottom', type: 'Solid', autoConnect: false },
            { x: 4, y: 3, side: 'bottom', type: 'Solid', autoConnect: false },
            { x: 5, y: 3, side: 'bottom', type: 'Solid', autoConnect: false },
            { x: 5, y: 1, side: 'right', type: 'Liquid', autoConnect: false }
        ],
        mask: Mask.Uniform(6, 4, MASK_REGULAR_MACHINE),
        color: 'rgba(255, 255, 255, 0.3)',
    }, { // 供电桩 supply-pole sup
        id: 'sup',
        name: '供電樁',
        power: 0,
        supplyDistance: 5,
        width: 2,
        height: 2,
        inputs: [],
        outputs: [],
        mask: Mask.Uniform(2, 2, MASK_REGULAR_MACHINE),
        color: 'rgba(255, 230, 128, 0.3)',
    }, { // 息壤供电桩 xi-rang-supply-pole xrs
        id: 'xrs',
        name: '息壤供電樁',
        power: 0,
        supplyDistance: 5,
        width: 2,
        height: 2,
        inputs: [],
        outputs: [],
        mask: Mask.Uniform(2, 2, MASK_REGULAR_MACHINE),
        color: 'rgba(255, 230, 128, 0.3)',
    }, { // 中继器 repeater rpt
        id: 'rpt',
        name: '中繼器',
        power: 0,
        supplyDistance: 2,
        width: 3,
        height: 3,
        inputs: [],
        outputs: [],
        mask: Mask.Uniform(3, 3, MASK_REGULAR_MACHINE),
        color: 'rgba(255, 230, 128, 0.3)',
    }, { // 息壤中继器 xi-rang-repeater xrr
        id: 'xrr',
        name: '息壤中繼器',
        power: 0,
        supplyDistance: 2,
        width: 3,
        height: 3,
        inputs: [],
        outputs: [],
        mask: Mask.Uniform(3, 3, MASK_REGULAR_MACHINE),
        color: 'rgba(255, 230, 128, 0.3)',
    }, { // 热能池 thermal-pool thp
        id: 'thp',
        name: '熱能池',
        power: 0,
        supplyDistance: 0,
        width: 2,
        height: 2,
        inputs: [
            { x: 0, y: 0, side: 'top', type: 'Solid', autoConnect: false },
            { x: 1, y: 0, side: 'top', type: 'Solid', autoConnect: false },
        ],
        outputs: [],
        mask: Mask.Uniform(2, 2, MASK_REGULAR_MACHINE),
        color: 'rgba(255, 255, 255, 0.3)',
    },
];

// 预计算 4 种旋转掩码，模块加载时一次性完成
for (const m of MACHINES) {
    m.mask4 = [0, 1, 2, 3].map(r => Mask.FromMask(m.mask, r as Direction));
}

export const getMachineConfig = (id: string) => MACHINES.find(m => m.id === id);
