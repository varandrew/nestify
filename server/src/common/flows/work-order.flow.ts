import { Repository, Transaction, TransactionRepository } from 'typeorm';
import { Injectable } from '@nestjs/common';
import { Logger } from '../lib/logger';
import { BaseFlow } from './base.flow';
import { FlowTemplateEnum, FlowOperationsEnum } from '../aspects/enum';
import { InjectRepository } from '@nestjs/typeorm';
import { FlowTemplate } from '../entities/flow-template.entity';
import { User } from '../entities/user.entity';
import { Flow } from '../entities/flow.entity';
import { WFResult, WFStatus } from '../lib/wf';
import { Service } from '../entities/service.entity';
import { Detail } from '../entities/detail.entity';

@Injectable()
export class WorkOrderFlow extends BaseFlow {
    protected readonly name: string = '服务工单';
    protected readonly template: FlowTemplateEnum = FlowTemplateEnum.WORK_OR;
    protected readonly flowSteps: any = [
        {
            name: '待申请',
            steps: [{ name: '申请', nextState: '待派单', task: this.apply, roles: ['self'] }]
        },
        {
            name: '待派单',
            steps: [
                { name: '派单', nextState: '待接单', task: this.allocation, roles: ['admin'], operation: FlowOperationsEnum.ALLOCATION },
                { name: '作废', nextState: '已作废', task: this.cancel, roles: ['self', 'admin'], operation: FlowOperationsEnum.REMARKS }
            ]
        },
        {
            name: '已拒绝',
            steps: [
                { name: '重新派单', nextState: '待接单', roles: ['admin'], task: this.allocation, operation: FlowOperationsEnum.ALLOCATION },
                { name: '作废', nextState: '已作废', roles: ['self', 'admin'], task: this.cancel, operation: FlowOperationsEnum.REMARKS }
            ]
        },
        {
            name: '待接单',
            steps: [
                { name: '接单', nextState: '待执行', roles: ['executor'], task: this.receipt },
                { name: '拒绝', nextState: '已拒绝', roles: ['executor'], task: this.refuse, operation: FlowOperationsEnum.REMARKS },
                { name: '作废', nextState: '已作废', task: this.cancel, roles: ['self', 'admin'], operation: FlowOperationsEnum.REMARKS }
            ]
        },
        {
            name: '待执行',
            steps: [{ name: '完成', nextState: '待结单', roles: ['executor'], task: this.complete }]
        },
        {
            name: '待结单',
            steps: [
                { name: '结单', nextState: '已结单', roles: ['admin'], task: this.statement },
                { name: '作废', nextState: '已作废', roles: ['admin'], task: this.cancel, operation: FlowOperationsEnum.REMARKS }
            ]
        },
        {
            name: '已结单',
            steps: []
        },
        {
            name: '已作废',
            steps: []
        }
    ];

    constructor(
        @InjectRepository(FlowTemplate)
        protected readonly flowTemplateRepository: Repository<FlowTemplate>
    ) {
        super(flowTemplateRepository);
    }

    @Transaction()
    async apply(
        step,
        flow,
        options,
        @TransactionRepository(Flow) flowRepos?: Repository<Flow>
    ) {

        flow = Flow.create(flow) as Flow;
        flow.wfResult = WFResult.RUNNING;
        flow.wfStatus = WFStatus.RUNNING;
        flow.state = step.nextState;

        await flowRepos.save(flow);
    }


    @Transaction()
    async allocation(
        step,
        flow,
        options,
        @TransactionRepository(Flow) flowRepos?: Repository<Flow>
    ) {

        flow = Flow.create(flow) as Flow;
        flow.state = step.nextState;
        flow.operator = User.create(options.operator) as User;
        flow.executor = User.create(options.executor) as User;

        await flowRepos.save(flow);
    }


    @Transaction()
    async refuse(
        step,
        flow,
        options,
        @TransactionRepository(Flow) flowRepos?: Repository<Flow>
    ) {

        flow = Flow.create(flow) as Flow;
        flow.state = step.nextState;
        flow.operator = User.create(options.operator) as User;
        flow.executor = null;

        await flowRepos.save(flow);
    }

    @Transaction()
    async receipt(
        step,
        flow,
        options,
        @TransactionRepository(Flow) flowRepos?: Repository<Flow>
    ) {

        flow = Flow.create(flow) as Flow;
        flow.state = step.nextState;
        flow.operator = User.create(options.operator) as User;

        await flowRepos.save(flow);
    }

    @Transaction()
    async complete(
        step,
        flow,
        options,
        @TransactionRepository(Flow) flowRepos?: Repository<Flow>
    ) {

        flow = Flow.create(flow) as Flow;
        flow.state = step.nextState;
        flow.operator = User.create(options.operator) as User;

        await flowRepos.save(flow);
    }

    @Transaction()
    async statement(
        step,
        flow,
        options,
        @TransactionRepository(Service) serviceRepos?: Repository<Service>,
        @TransactionRepository(User) userRepos?: Repository<User>,
        @TransactionRepository(Detail) detailRepos?: Repository<Detail>,
        @TransactionRepository(Flow) flowRepos?: Repository<Flow>
    ) {

        flow = await flowRepos.findOne({ where: { id: flow.id }, relations: ['user', 'operator', 'executor'] })
        flow.state = step.nextState;
        flow.wfResult = WFResult.SUCCESS;
        flow.wfStatus = WFStatus.OVER;
        flow.operator = User.create(options.operator) as User;

        await flowRepos.save(flow);

        const service = await serviceRepos.findOne(flow.target);

        // 给用户增加积分
        const user = await userRepos.findOne(flow.executor.id);
        user.points += service.points;
        await userRepos.save(user);

        // 增加积分明细
        const detail = new Detail();
        detail.title = '完成任务加积分';
        detail.value = service.points;
        detail.user = user;
        await detailRepos.save(detail);
    }

    @Transaction()
    async cancel(
        step,
        flow,
        options,
        @TransactionRepository(Flow) flowRepos?: Repository<Flow>
    ) {

        flow = Flow.create(flow) as Flow;
        flow.state = step.nextState;
        flow.wfResult = WFResult.FAILURE;
        flow.wfStatus = WFStatus.CANCELED;
        flow.operator = User.create(options.operator) as User;

        if (!!options.remarks) {
            const remarks = flow.ex_info.remarks || [];
            remarks.push(options.remarks);
            flow.ex_info.remarks = remarks;
        }

        await flowRepos.save(flow);
    }

}
