"use strict";

import powerbi from "powerbi-visuals-api";
import { FormattingSettingsService } from "powerbi-visuals-utils-formattingmodel";
import "./../style/visual.less";

import VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions;
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;
import IVisual = powerbi.extensibility.visual.IVisual;
import IVisualEventService = powerbi.extensibility.IVisualEventService;
import IVisualHost = powerbi.extensibility.visual.IVisualHost;
import ITooltipService = powerbi.extensibility.ITooltipService;
import VisualTooltipDataItem = powerbi.extensibility.VisualTooltipDataItem;
import ISelectionId = powerbi.visuals.ISelectionId;

import { VisualFormattingSettingsModel } from "./settings";
import { convertDataView } from "./data/dataConverter";
import { buildMatrixHtml, parseCellTooltip } from "./components/MatrixRenderer";
import { buildKpiContainerCard } from "./services/KpiFormattingModel";
import type { VisualViewModel } from "./data/viewModel";

export class Visual implements IVisual {
    private events: IVisualEventService;
    private visualHost: IVisualHost;
    private tooltipService: ITooltipService;
    private target: HTMLElement;
    private host: HTMLElement;
    private formattingSettings: VisualFormattingSettingsModel;
    private formattingSettingsService: FormattingSettingsService;
    private selectionIds: ISelectionId[] = [];
    private activeTip: HTMLElement | null = null;
    private lastView: VisualViewModel | null = null;
    private lastPersistedCategoriesJson = "";
    /** Categoria à qual título/imagem do editor pertencem (evita gravar no KPI errado ao trocar o dropdown). */
    private editorCategoryKey = "";

    constructor(options: VisualConstructorOptions) {
        this.events = options.host.eventService;
        this.visualHost = options.host;
        this.tooltipService = options.host.tooltipService;
        this.formattingSettingsService = new FormattingSettingsService();
        this.formattingSettings = new VisualFormattingSettingsModel();
        this.target = options.element;
        this.host = document.createElement("div");
        this.host.className = "dkm-host";
        this.target.appendChild(this.host);
        this.host.addEventListener("pointerover", this.onPointerOver);
        this.host.addEventListener("pointermove", this.onPointerMove);
        this.host.addEventListener("pointerout", this.onPointerOut);
        this.host.addEventListener("pointerleave", this.onPointerLeave);
    }

    public update(options: VisualUpdateOptions): void {
        this.events.renderingStarted(options);
        try {
            this.hideTip();
            const dataView = options.dataViews?.[0];
            if (dataView) {
                this.formattingSettings = this.formattingSettingsService.populateFormattingSettingsModel(
                    VisualFormattingSettingsModel,
                    dataView,
                );
            }

            this.selectionIds = this.buildSelectionIds(dataView);
            this.syncCategoryEditorState();

            const style = this.formattingSettings.toResolvedStyle();
            const view = convertDataView(dataView, this.formattingSettings.convertOptions());
            this.lastView = view;
            this.formattingSettings.syncCategoryEditorFromMap(view.categoryNames);

            // HTML gerado pelo próprio visual (não é input livre do usuário).
            // eslint-disable-next-line powerbi-visuals/no-inner-outer-html
            this.host.innerHTML = buildMatrixHtml(view, style);
            this.events.renderingFinished(options);
        } catch (error) {
            this.events.renderingFailed(options, String(error));
        }
    }

    public getFormattingModel(): powerbi.visuals.FormattingModel {
        if (this.lastView) {
            this.formattingSettings.syncCategoryEditorFromMap(this.lastView.categoryNames);
        }
        const model = this.formattingSettingsService.buildFormattingModel(this.formattingSettings);
        if (this.lastView?.columns.length) {
            const card = buildKpiContainerCard(this.lastView.columns, this.lastView.complementOptions);
            if (card) {
                model.cards.push(card);
            }
        }
        return model;
    }

    public destroy(): void {
        this.hideTip();
        this.host.removeEventListener("pointerover", this.onPointerOver);
        this.host.removeEventListener("pointermove", this.onPointerMove);
        this.host.removeEventListener("pointerout", this.onPointerOut);
        this.host.removeEventListener("pointerleave", this.onPointerLeave);
    }

    private syncCategoryEditorState(): void {
        const selected = this.formattingSettings.getSelectedCategoryName();
        if (this.editorCategoryKey && this.editorCategoryKey !== selected) {
            // Dropdown mudou: não mesclar título/imagem antigos na nova categoria.
            this.formattingSettings.syncCategoryEditorFromMap(this.lastView?.categoryNames ?? []);
            this.editorCategoryKey = selected;
            return;
        }

        if (selected) {
            const synced = this.formattingSettings.buildSyncedCategoriesJson();
            const current =
                this.formattingSettings.categoryImages.categoriesJson.value?.trim() || "{}";
            if (synced !== current && synced !== this.lastPersistedCategoriesJson) {
                this.lastPersistedCategoriesJson = synced;
                this.formattingSettings.categoryImages.categoriesJson.value = synced;
                this.visualHost.persistProperties({
                    merge: [
                        {
                            objectName: "categoryImages",
                            selector: null as unknown as powerbi.data.Selector,
                            properties: {
                                categoriesJson: synced,
                            },
                        },
                    ],
                });
            }
        }
        this.editorCategoryKey = selected;
    }

    private buildSelectionIds(dataView?: powerbi.DataView): ISelectionId[] {
        const matrix = dataView?.matrix;
        const children = matrix?.rows?.root?.children ?? [];
        const levels = matrix?.rows?.levels ?? [];
        if (!children.length) {
            return [];
        }

        return children
            .map((node) => {
                if ((node as { isSubtotal?: boolean }).isSubtotal) {
                    return null;
                }
                try {
                    return this.visualHost
                        .createSelectionIdBuilder()
                        .withMatrixNode(node, levels)
                        .createSelectionId();
                } catch {
                    return null;
                }
            })
            .filter((id): id is ISelectionId => Boolean(id));
    }

    private onPointerOver = (event: PointerEvent) => {
        if (!this.formattingSettings?.tooltip.enabled.value) {
            return;
        }
        const cell = this.tipCell(event.target);
        if (!cell) {
            return;
        }
        this.showTip(cell, event);
    };

    private onPointerMove = (event: PointerEvent) => {
        if (!this.activeTip) {
            return;
        }
        this.tooltipService.move({
            coordinates: [event.clientX, event.clientY],
            isTouchEvent: event.pointerType === "touch",
            dataItems: parseCellTooltip(this.activeTip.dataset.tip) as VisualTooltipDataItem[],
            identities: this.identitiesFor(this.activeTip),
        });
    };

    private onPointerOut = (event: PointerEvent) => {
        const cell = this.activeTip;
        if (!cell) {
            return;
        }
        const related = event.relatedTarget as Node | null;
        if (related && cell.contains(related)) {
            return;
        }
        this.hideTip();
    };

    private onPointerLeave = () => {
        this.hideTip();
    };

    private showTip(cell: HTMLElement, event: PointerEvent): void {
        const dataItems = parseCellTooltip(cell.dataset.tip) as VisualTooltipDataItem[];
        if (!dataItems.length) {
            return;
        }
        this.activeTip = cell;
        this.tooltipService.show({
            coordinates: [event.clientX, event.clientY],
            isTouchEvent: event.pointerType === "touch",
            dataItems,
            identities: this.identitiesFor(cell),
        });
    }

    private hideTip(): void {
        this.activeTip = null;
        this.tooltipService.hide({ immediately: true, isTouchEvent: false });
    }

    private tipCell(target: EventTarget | null): HTMLElement | null {
        if (!(target instanceof Element)) {
            return null;
        }
        return target.closest(".dkm-cat.dkm-tip") as HTMLElement | null;
    }

    private identitiesFor(cell: HTMLElement): ISelectionId[] {
        const index = Number(cell.dataset.rowIndex);
        if (!Number.isFinite(index) || index < 0 || index >= this.selectionIds.length) {
            return [];
        }
        return [this.selectionIds[index]];
    }
}
