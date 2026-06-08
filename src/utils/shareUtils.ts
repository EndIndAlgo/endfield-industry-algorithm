import html2canvas from 'html2canvas';
import type { Point } from '../types';
import { MACHINES } from '../config/machines';
import { getRotatedDimensions } from './machineUtils';

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
const encode = (data: { machines: any[]; connections: any[] }): Uint8Array => {
    const { machines, connections } = data;

    // Compute bounding box for position normalization
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const m of machines) {
        const cfg = MACHINES.find(c => c.id === m.machineId);
        if (!cfg) continue;
        const { width, height } = getRotatedDimensions(cfg.width, cfg.height, m.rotation);
        minX = Math.min(minX, m.x);
        minY = Math.min(minY, m.y);
        maxX = Math.max(maxX, m.x + width);
        maxY = Math.max(maxY, m.y + height);
    }
    for (const c of connections) {
        for (const p of c.path) {
            minX = Math.min(minX, p.x);
            minY = Math.min(minY, p.y);
            maxX = Math.max(maxX, p.x + 1);
            maxY = Math.max(maxY, p.y + 1);
        }
    }
    if (!isFinite(minX)) { minX = 0; minY = 0; }

    const out: number[] = [];
    const writeU16 = (v: number) => { out.push((v >> 8) & 0xFF, v & 0xFF); };

    // Machines: each = 3 bytes ID + 1 byte x + 1 byte y + 1 byte rotation
    writeU16(machines.length);
    for (const m of machines) {
        for (let i = 0; i < 3; i++) out.push(m.machineId.charCodeAt(i));
        out.push(m.x - minX);
        out.push(m.y - minY);
        out.push(m.rotation);
    }

    // Connections
    writeU16(connections.length);
    for (const c of connections) {
        const header = ((c.portType === 'Liquid' ? 1 : 0) << 5) | ((c.tailFacing & 3) << 2) | (c.headFacing & 3);
        out.push(header);
        out.push(c.path[0].x - minX);
        out.push(c.path[0].y - minY);
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

const decode = (bytes: Uint8Array): any => {
    let off = 0;

    const readU16 = (): number => {
        const v = (bytes[off] << 8) | bytes[off + 1];
        off += 2;
        return v;
    };

    // Machines: each = 3 bytes ID + 1 byte x + 1 byte y + 1 byte rotation
    const machineCount = readU16();
    const machines: any[] = [];
    for (let i = 0; i < machineCount; i++) {
        const machineId = String.fromCharCode(bytes[off], bytes[off + 1], bytes[off + 2]);
        off += 3;
        machines.push({
            id: crypto.randomUUID(),
            machineId,
            x: bytes[off++],
            y: bytes[off++],
            rotation: bytes[off++]
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
    const connections: any[] = [];
    for (let i = 0; i < connCount; i++) {
        const header = bytes[off++];
        const tailFacing = (header >> 2) & 3;
        const headFacing = header & 3;
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
export const generateShareUrl = (blueprintData: any): string => {
    try {
        const bytes = encode(blueprintData);
        const encoded = toBase64Url(bytes);
        return `${window.location.origin}${window.location.pathname}?bp=${encoded}`;
    } catch (e) {
        console.error('Share URL generation failed', e);
        return '';
    }
};

export const parseShareUrl = async (): Promise<any | null> => {
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

export const captureBlueprintScreenshot = async (): Promise<string | null> => {
    const gridContainer = document.querySelector('.grid-container');
    if (!gridContainer) return null;

    const zoomContent = gridContainer.querySelector('.zoom-content') as HTMLElement;
    if (!zoomContent) return null;

    const gridBackground = zoomContent.querySelector('.grid-background') as HTMLElement;
    if (!gridBackground) return null;

    const width = parseInt(gridBackground.style.width);
    const height = parseInt(gridBackground.style.height);

    const cloneWrapper = document.createElement('div');
    cloneWrapper.style.position = 'absolute';
    cloneWrapper.style.top = '0';
    cloneWrapper.style.left = '0';
    cloneWrapper.style.width = `${width}px`;
    cloneWrapper.style.height = `${height}px`;
    cloneWrapper.style.zIndex = '-9999';
    cloneWrapper.style.overflow = 'hidden';

    const clonedContent = zoomContent.cloneNode(true) as HTMLElement;
    clonedContent.style.transform = 'none';
    clonedContent.style.width = '100%';
    clonedContent.style.height = '100%';
    cloneWrapper.style.backgroundColor = getComputedStyle(gridContainer).backgroundColor;
    cloneWrapper.appendChild(clonedContent);
    document.body.appendChild(cloneWrapper);

    await new Promise(resolve => setTimeout(resolve, 100));

    try {
        const canvas = await html2canvas(cloneWrapper, {
            width, height, backgroundColor: null, scale: 1,
            logging: false, useCORS: true, scrollX: 0, scrollY: 0, x: 0, y: 0
        });
        const dataUrl = canvas.toDataURL('image/png');
        if (document.body.contains(cloneWrapper)) document.body.removeChild(cloneWrapper);
        return dataUrl;
    } catch (e) {
        console.error('Screenshot failed', e);
        if (document.body.contains(cloneWrapper)) document.body.removeChild(cloneWrapper);
        return null;
    }
};
