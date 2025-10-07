/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

const SVG_NS = 'http://www.w3.org/2000/svg';

const random = (min: number, max: number): number => Math.random() * (max - min) + min;

class Config {
    params: URLSearchParams;
    isRandom: boolean;

    constructor() {
        this.params = new URLSearchParams(window.location.search);
        this.isRandom = this.params.has('random');
    }

    get(key: string, type: 'number' | 'string' | 'number[]' | 'string[]', defaultValue: any, randomGenerator?: () => any) {
        if (this.params.has(key)) {
            const value = this.params.get(key)!;
            switch (type) {
                case 'number':
                    return parseFloat(value);
                case 'number[]':
                case 'string[]':
                    try {
                        // Allow for simple comma-separated values as well as JSON arrays
                        if (value.startsWith('[') && value.endsWith(']')) {
                            return JSON.parse(value);
                        }
                        return value.split(',').map(v => type === 'number[]' ? parseFloat(v) : v);
                    } catch (e) {
                        console.error(`Error parsing array for key ${key}:`, e);
                        return defaultValue;
                    }
                default:
                    return value;
            }
        }
        if (this.isRandom && randomGenerator) {
            return randomGenerator();
        }
        return defaultValue;
    }
}

interface Pendulum {
    height: number;
    width: number;
    angle: number;
    speed: number;
    color: string;
    elements: {
        arm: SVGLineElement;
    };
}

class PendulumSimulation {
    svg: SVGSVGElement;
    config: any = {};
    pendulums: Pendulum[] = [];
    animationFrameId: number | null = null;
    trailPoints: string = '';
    trailPath: SVGPolylineElement | null = null;
    trailFillGroup: SVGGElement | null = null;
    center: { x: number; y: number };

    // New properties for round completion tracking
    startPoint: { x: number; y: number } | null = null;
    pivot: SVGCircleElement | null = null;
    frameCount: number = 0;
    isNearStart: boolean = false;


    constructor() {
        // Fix: Cast to unknown first to satisfy TypeScript's type checker when converting from HTMLElement to SVGSVGElement.
        this.svg = document.getElementById('canvas') as unknown as SVGSVGElement;
        const applyBtn = document.getElementById('apply-btn')!;
        applyBtn.addEventListener('click', () => this.init());

        this.center = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
        window.addEventListener('resize', () => {
            this.center = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
            this.init();
        });

        this.init();
    }

    init() {
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
        }
        this.svg.innerHTML = '';
        this.pendulums = [];
        this.trailPoints = '';
        this.frameCount = 0;
        this.isNearStart = false;

        const c = new Config();
        const isRandom = c.isRandom;

        const numPendulums = c.get('pendulums', 'number', 3, () => Math.round(random(2, 5)));
        const saturation = c.get('saturation', 'number', 85, () => random(70, 100));
        const lightness = c.get('lightness', 'number', 60, () => random(50, 70));

        this.config = {
            lineWidth: c.get('lineWidth', 'number', 2, () => random(1, 3)),
            lineColor: c.get('lineColor', 'string', '#ffffff', () => `hsl(${random(0,360)}, 85%, 85%)`),
            lineFill: c.get('lineFill', 'string', 'rgba(0,0,0,0.2)', () => `hsla(${random(0,360)}, 50%, 10%, 0.2)`),
        };

        const speeds = c.get('speeds', 'number[]', undefined, undefined);
        const speedBase = c.get('speed', 'number', 0.01, () => random(-0.05, 0.05));
        const speedGap = c.get('speedGap', 'number', 0.01, () => random(-0.02, 0.02));

        const heights = c.get('heights', 'number[]', undefined, undefined);
        const heightBase = c.get('height', 'number', 100, () => random(50, 150));
        const heightGap = c.get('heightGap', 'number', -10, () => random(-50, 20));

        const widths = c.get('widths', 'number[]', undefined, undefined);
        const widthBase = c.get('width', 'number', 5, () => random(3, 8));
        const widthGap = c.get('widthGap', 'number', -0.5, () => random(-1, 0.5));

        const angles = c.get('angles', 'number[]', undefined, undefined);
        const angleBase = c.get('angle', 'number', Math.PI / 2, () => random(-Math.PI, Math.PI));
        const angleGap = c.get('angleGap', 'number', Math.PI / 4, () => random(-Math.PI / 2, Math.PI / 2));

        const colors = c.get('colors', 'string[]', undefined, undefined);
        const colorBase = c.get('color', 'number', 180, () => random(0, 360));
        const colorGap = c.get('colorGap', 'number', 30, () => random(10, 60));

        this.trailFillGroup = document.createElementNS(SVG_NS, 'g');
        this.svg.appendChild(this.trailFillGroup);

        this.pivot = document.createElementNS(SVG_NS, 'circle');
        this.pivot.setAttribute('id', 'pivot');
        this.pivot.setAttribute('cx', String(this.center.x));
        this.pivot.setAttribute('cy', String(this.center.y));
        this.pivot.setAttribute('r', '4');
        this.pivot.setAttribute('fill', '#999');
        this.svg.appendChild(this.pivot);

        for (let i = 0; i < numPendulums; i++) {
            const p: Pendulum = {
                speed: speeds ? speeds[i] : speedBase + i * speedGap,
                height: heights ? heights[i] : Math.max(10, heightBase + i * heightGap),
                width: widths ? widths[i] : Math.max(1, widthBase + i * widthGap),
                angle: angles ? angles[i] : angleBase + i * angleGap,
                color: colors ? colors[i] : `hsl(${(colorBase + i * colorGap) % 360}, ${saturation}%, ${lightness}%)`,
                elements: { arm: document.createElementNS(SVG_NS, 'line') }
            };

            p.elements.arm.setAttribute('stroke', p.color);
            p.elements.arm.setAttribute('stroke-width', String(p.width));
            p.elements.arm.setAttribute('stroke-linecap', 'round');
            this.svg.appendChild(p.elements.arm);
            this.pendulums.push(p);
        }
        
        this.startPoint = this.calculateInitialEndPoint();

        this.trailPath = document.createElementNS(SVG_NS, 'polyline');
        this.trailPath.setAttribute('fill', 'none');
        this.trailPath.setAttribute('stroke', this.config.lineColor);
        this.trailPath.setAttribute('stroke-width', String(this.config.lineWidth));
        this.trailPath.setAttribute('stroke-opacity', '0.8');
        this.svg.appendChild(this.trailPath);

        this.animate();
    }

    calculateInitialEndPoint(): { x: number; y: number } {
        let x = this.center.x;
        let y = this.center.y;
        for (const p of this.pendulums) {
            x += p.height * Math.cos(p.angle);
            y += p.height * Math.sin(p.angle);
        }
        return { x, y };
    }

    darkenPivot() {
        if (!this.pivot) return;
        this.pivot.setAttribute('fill', '#000000');
        this.pivot.setAttribute('r', '6');
    }

    resetPivot() {
        if (!this.pivot) return;
        this.pivot.setAttribute('fill', '#999');
        this.pivot.setAttribute('r', '4');
    }

    animate() {
        this.frameCount++;
        let lastX = this.center.x;
        let lastY = this.center.y;

        for (const pendulum of this.pendulums) {
            pendulum.angle += pendulum.speed;
            const x = lastX + pendulum.height * Math.cos(pendulum.angle);
            const y = lastY + pendulum.height * Math.sin(pendulum.angle);
            pendulum.elements.arm.setAttribute('x1', String(lastX));
            pendulum.elements.arm.setAttribute('y1', String(lastY));
            pendulum.elements.arm.setAttribute('x2', String(x));
            pendulum.elements.arm.setAttribute('y2', String(y));
            lastX = x;
            lastY = y;
        }

        if (this.startPoint && this.frameCount > 100) {
            const dx = lastX - this.startPoint.x;
            const dy = lastY - this.startPoint.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            const threshold = 5;

            if (distance < threshold) {
                if (!this.isNearStart) {
                    this.isNearStart = true;
                    this.darkenPivot();
                }
            } else {
                if (this.isNearStart) {
                    this.isNearStart = false;
                    this.resetPivot();
                }
            }
        }

        const newPoint = `${lastX},${lastY}`;
        this.trailPoints = this.trailPoints ? `${this.trailPoints} ${newPoint}` : newPoint;
        if (this.trailPath) {
            this.trailPath.setAttribute('points', this.trailPoints);
        }

        if (this.trailFillGroup) {
            const fillCircle = document.createElementNS(SVG_NS, 'circle');
            fillCircle.setAttribute('cx', String(lastX));
            fillCircle.setAttribute('cy', String(lastY));
            fillCircle.setAttribute('r', '20');
            fillCircle.setAttribute('fill', this.config.lineFill);
            this.trailFillGroup.appendChild(fillCircle);
        }

        const points = this.trailPoints.split(' ');
        if (points.length > 2000) {
            this.trailPoints = points.slice(1).join(' ');
            if (this.trailFillGroup && this.trailFillGroup.firstChild) {
                this.trailFillGroup.removeChild(this.trailFillGroup.firstChild);
            }
        }

        this.animationFrameId = requestAnimationFrame(() => this.animate());
    }
}

window.addEventListener('DOMContentLoaded', () => {
    new PendulumSimulation();
});