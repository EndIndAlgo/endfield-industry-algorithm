import type { Point, PlacedMachine, Connection, Direction } from '@/types';
import { MACHINES } from '@/config/machines';
import { getRotatedDimensions } from './machineUtils';
import { getBoundingBox } from './grid';
import { activeCanvasController } from '@/pixi/CanvasController';

// ===== Base64 =====
const toBase64Url = (bytes: Uint8Array): string => {
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

const fromBase64Url = (str: string): Uint8Array => {
    str = str.replace(/-/g, '+').replace(/_/g, '/');
    while (str.length % 4) str += '=';
    const binary = atob(str);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
};

// ===== Binary Format =====
interface DecodedBlueprint {
  machines: PlacedMachine[];
  connections: Connection[];
  gridWidth: number;
  gridHeight: number;
}

const encode = (data: { machines: PlacedMachine[]; connections: Connection[] }): Uint8Array => {
    const { machines, connections } = data;

    // Compute bounding box for position normalization
    const bb = getBoundingBox(machines, connections);

    const out: number[] = [];
    const writeU16 = (v: number) => { out.push((v >> 8) & 0xFF, v & 0xFF); };

    // Machines: each = 3 bytes ID + 1 byte x + 1 byte y + 1 byte rotation
    writeU16(machines.length);
    for (const m of machines) {
        for (let i = 0; i < 3; i++) out.push(m.machineId.charCodeAt(i));
        out.push(m.x - bb.minX);
        out.push(m.y - bb.minY);
        out.push(m.rotation);
    }

    // Connections
    writeU16(connections.length);
    for (const c of connections) {
        const header = ((c.portType === 'Liquid' ? 1 : 0) << 5) | ((c.tailFacing & 3) << 2) | (c.headFacing & 3);
        out.push(header);
        out.push(c.path[0].x - bb.minX);
        out.push(c.path[0].y - bb.minY);
        const steps = c.path.length - 1;
        out.push(steps);

        // Pack 2-bit directions (0=Up, 1=Right, 2=Down, 3=Left)
        let bits = 0;
        let bitCount = 0;
        for (let i = 0; i < steps; i++) {
            const a = c.path[i];
            const b = c.path[i + 1];
            const dir = (b.x > a.x ? 1 : b.x < a.x ? 3 : b.y > a.y ? 2 : 0);
            bits = (bits << 2) | dir;
            bitCount += 2;
            if (bitCount === 8) {
                out.push(bits);
                bits = 0;
                bitCount = 0;
            }
        }
        if (bitCount > 0) {
            out.push(bits << (8 - bitCount));
        }
    }

    return new Uint8Array(out);
};

const decode = (bytes: Uint8Array): DecodedBlueprint => {
    let off = 0;

    const readU16 = (): number => {
        const v = (bytes[off] << 8) | bytes[off + 1];
        off += 2;
        return v;
    };

    // Machines: each = 3 bytes ID + 1 byte x + 1 byte y + 1 byte rotation
    const machineCount = readU16();
    const machines: PlacedMachine[] = [];
    for (let i = 0; i < machineCount; i++) {
        const machineId = String.fromCharCode(bytes[off], bytes[off + 1], bytes[off + 2]);
        off += 3;
        machines.push({
            id: crypto.randomUUID(),
            machineId,
            x: bytes[off++],
            y: bytes[off++],
            rotation: bytes[off++] as Direction
        });
    }

    // Compute content size for grid dimensions
    let maxX = 0, maxY = 0;
    for (const m of machines) {
        const cfg = MACHINES.find(c => c.id === m.machineId);
        if (cfg) {
            const { width, height } = getRotatedDimensions(cfg.width, cfg.height, m.rotation);
            maxX = Math.max(maxX, m.x + width);
            maxY = Math.max(maxY, m.y + height);
        }
    }

    // Connections
    const connCount = readU16();
    const connections: Connection[] = [];
    for (let i = 0; i < connCount; i++) {
        const header = bytes[off++];
        const tailFacing = ((header >> 2) & 3) as Direction;
        const headFacing = (header & 3) as Direction;
        const portType = (header >> 5) & 1 ? 'Liquid' as const : 'Solid' as const;
        const tx = bytes[off++];
        const ty = bytes[off++];
        const steps = bytes[off++];

        const path: Point[] = [{ x: tx, y: ty }];
        let cx = tx, cy = ty;

        const dirBytes = Math.ceil(steps * 2 / 8);
        for (let s = 0; s < steps; s++) {
            const byteIdx = Math.floor(s * 2 / 8);
            const bitShift = 6 - ((s * 2) % 8);
            const dir = (bytes[off + byteIdx] >> bitShift) & 3;
            switch (dir) {
                case 0: cy -= 1; break;
                case 1: cx += 1; break;
                case 2: cy += 1; break;
                case 3: cx -= 1; break;
            }
            path.push({ x: cx, y: cy });
        }
        off += dirBytes;

        maxX = Math.max(maxX, cx + 1);
        maxY = Math.max(maxY, cy + 1);

        connections.push({
            id: crypto.randomUUID(),
            tailFacing,
            headFacing,
            path,
            portType
        });
    }

    const gridSize = Math.max(Math.max(maxX, maxY) + 4, 24);
    return { machines, connections, gridWidth: gridSize, gridHeight: gridSize };
};

// ===== Public API =====
export const generateShareUrl = (blueprintData: { machines: PlacedMachine[]; connections: Connection[] }): string => {
    try {
        const bytes = encode(blueprintData);
        const encoded = toBase64Url(bytes);
        return `${window.location.origin}${window.location.pathname}?bp=${encoded}`;
    } catch (e) {
        console.error('Share URL generation failed', e);
        return '';
    }
};

export const parseShareUrl = async (): Promise<DecodedBlueprint | null> => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('bp');
    if (!code) return null;

    try {
        const bytes = fromBase64Url(code);

        return decode(bytes);
    } catch (e) {
        console.error('Failed to parse blueprint from URL', e);
        return null;
    }
};

/**
 * 截图当前画布（PixiJS canvas 白底合成 → PNG dataURL）
 *
 * Pixi 迁移后旧 DOM 截图（.zoom-content + html2canvas）已失效，改为直接
 * 从活动 CanvasController 的画布合成：截图范围为当前视口（含缩放/平移状态）。
 */
export const captureBlueprintScreenshot = async (): Promise<string | null> => {
    try {
        const controller = activeCanvasController.current;
        const source = controller?.getCanvas();
        if (!controller || !source) return null;

        // 立即渲染一帧，确保 WebGL 缓冲包含最新内容后再合成
        controller.renderNow();

        const canvas = document.createElement('canvas');
        canvas.width = source.width;
        canvas.height = source.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;

        // 画布背景透明（backgroundAlpha: 0），先铺白底再叠加画布内容
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(source, 0, 0);

        return canvas.toDataURL('image/png');
    } catch (e) {
        console.error('Screenshot failed', e);
        return null;
    }
};
