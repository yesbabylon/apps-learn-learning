import { Component, OnInit } from '@angular/core';
import { Course, Module, UserStatement } from '../_types/learn';
import { AppInfo, EnvironmentInfo } from '../_types/equal';
// @ts-ignore
import { ApiService } from 'sb-shared-lib';
import { ActivatedRoute, Router } from '@angular/router';
import { LearnService } from '../_services/Learn.service';
import { CompletionDialogComponent } from '../_components/completion-dialog/completion-dialog.component';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';

export enum MessageEventEnum {
    EQ_ACTION_LEARN_NEXT = 'eq_action_learn_next',
    CHAPTER_REMOVED = 'chapter_removed',
    PAGE_REMOVED = 'page_removed',
    CHAPTER_PROGRESSION_FINISHED = 'chapter_progression_finished',
    MODULE_PROGRESSION_FINISHED = 'module_progression_finished',
}

export type QursusMessageEvent = {
    type: MessageEventEnum;
    data: any;
};

@Component({
    // eslint-disable-next-line @angular-eslint/component-selector
    selector: 'app',
    templateUrl: 'app.component.html',
    styleUrls: ['app.component.scss'],
})
export class AppComponent implements OnInit {
    public userStatement: UserStatement;
    public environnementInfo: EnvironmentInfo;
    public appInfo: AppInfo;

    public course: Course;
    public has_access_to_course: boolean = false;
    public is_loading: boolean = true;

    public current_module_progression_index: number;
    public current_chapter_progression_index: number;
    public current_page_progression_index: number;

    public device: 'small' | 'large';

    constructor(
        private api: ApiService,
        private route: ActivatedRoute,
        private router: Router,
        private learnService: LearnService,
        private completionDialog: MatDialog,
    ) {
    }

    public ngOnInit(): void {
        if (window.innerWidth < 1024) {
            this.device = 'small';
        } else {
            this.device = 'large';
        }

        this.load();
    }

    private async load(): Promise<void> {
        this.environnementInfo = await this.api.get('appinfo/learn/learning');
        this.appInfo = await this.api.get('envinfo');

        await this.learnService.loadRessources(+this.route.snapshot.params.id);
        this.userStatement = this.learnService.getUserStatement();
        this.course = this.learnService.course;

        if (this.course) {
            this.current_module_progression_index = this.learnService.currentProgressionIndex.module;
            this.current_chapter_progression_index = this.learnService.currentProgressionIndex.chapter;
            this.current_page_progression_index = this.learnService.currentProgressionIndex.page;
            this.has_access_to_course = true;
            this.is_loading = false;
        } else {
            await this.router.navigate(['**']);
        }

        window.addEventListener('message', (event: MessageEvent): void => {
            const navigatorUrl: URL = new URL(window.location.href);

            if (event.origin !== navigatorUrl.origin) {
                return;
            }

            try {
                event.data.hasOwnProperty('type') && event.data.hasOwnProperty('data')
                    ? console.table({ name: event.data.type, ...event.data.data })
                    : console.table({ name: event.data });

                this.handleQursusIframeEvent(event.data);
            } catch (error) {
                console.error('AppComponent.handleQursusIframeEvent =>', error);
                console.table({ eventName: event.data.type, ...event.data.data });
            }
        });
    }

    /**
     * Handle the Qursus iframe
     */
    private async handleQursusIframeEvent(event: QursusMessageEvent): Promise<void> {
        switch (event.type) {
            case MessageEventEnum.CHAPTER_REMOVED:
                this.learnService.removeChapter(
                    event.data.module_id,
                    event.data.chapter_id,
                );
                this.course = this.learnService.course;
                break;

            case MessageEventEnum.PAGE_REMOVED:
                await this.learnService.reloadChapter(
                    event.data.module_id,
                    event.data.chapter_id,
                );
                this.course = this.learnService.course;
                break;

            case MessageEventEnum.EQ_ACTION_LEARN_NEXT:
                this.learnService.currentProgressionIndex.chapter = event.data.chapter_index;
                this.current_chapter_progression_index = event.data.chapter_index;

                await this.learnService.loadUserStatus();
                this.userStatement = this.learnService.getUserStatement();
                break;


            case MessageEventEnum.CHAPTER_PROGRESSION_FINISHED:
                await this.learnService.loadUserStatus();
                this.userStatement.userStatus = this.learnService.userStatus;

                let chapter_index: number = event.data.chapter_index;

                if (this.course.modules[this.current_module_progression_index].chapters[chapter_index + 1]) {
                    ++chapter_index;
                }

                this.learnService.currentProgressionIndex = {
                    ...this.learnService.currentProgressionIndex,
                    chapter: chapter_index,
                    page: 0,
                };

                this.current_chapter_progression_index = chapter_index;
                break;

            case MessageEventEnum.MODULE_PROGRESSION_FINISHED:
                const module_index: number = this.course.modules.findIndex(module => module.id === event.data.module_id);
                const next_module: Module = this.course.modules[module_index + 1];

                if (!next_module) {
                    return;
                }

                await this.learnService.loadUserStatus();
                this.userStatement.userStatus = this.learnService.userStatus;

                this.course = await this.learnService.loadCourseModule(next_module.id);

                this.openModuleCompletionDialog();
                break;
        }
    }

    /**
     * @see LearnService.loadCourseModule
     * @param data
     */
    public async onModuleClick(data: { module_id: number, chapter_id: number }): Promise<void> {
        this.course = await this.learnService.loadCourseModule(data.module_id);
    }

    /**
     * Used when the user has finished a module.
     * @private
     */
    private openModuleCompletionDialog(): void {
        this.completionDialog.closeAll();

        const dialogRef: MatDialogRef<CompletionDialogComponent> = this.completionDialog.open(CompletionDialogComponent, {
            data: { next: false },
        });

        dialogRef.afterClosed().subscribe(async result => {
            if (result) {
                const next_module_index: number = this.current_module_progression_index + 1;

                this.learnService.currentProgressionIndex = {
                    module: next_module_index,
                    chapter: 0,
                    page: 0,
                };

                await this.learnService.loadUserStatus();
                this.userStatement = this.learnService.getUserStatement();

                this.current_module_progression_index = next_module_index;
                this.current_chapter_progression_index = 0;
                this.current_page_progression_index = 0;

                this.completionDialog.closeAll();
            }
        });
    }
}
