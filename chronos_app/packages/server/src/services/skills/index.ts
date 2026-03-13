import { StatusCodes } from 'http-status-codes'
import { QueryRunner } from 'typeorm'
import { validate } from 'uuid'
import { Skill } from '../../database/entities/Skill'
import { InternalChronosError } from '../../errors/internalChronosError'
import { getErrorMessage } from '../../errors/utils'
import { CHRONOS_COUNTER_STATUS, CHRONOS_METRIC_COUNTERS } from '../../Interface.Metrics'
import { getAppVersion } from '../../utils'
import { getRunningExpressApp } from '../../utils/getRunningExpressApp'

/**
 * Create a new skill
 * @param requestBody - Skill data
 * @param orgId - Organisation ID for telemetry
 */
const createSkill = async (requestBody: any, orgId: string): Promise<any> => {
    try {
        const appServer = getRunningExpressApp()
        const newSkill = new Skill()
        Object.assign(newSkill, requestBody)
        const skill = await appServer.AppDataSource.getRepository(Skill).create(newSkill)
        const dbResponse = await appServer.AppDataSource.getRepository(Skill).save(skill)
        await appServer.telemetry.sendTelemetry(
            'skill_created',
            {
                version: await getAppVersion(),
                skillId: dbResponse.id,
                skillName: dbResponse.name
            },
            orgId
        )
        appServer.metricsProvider?.incrementCounter(CHRONOS_METRIC_COUNTERS.TOOL_CREATED, { status: CHRONOS_COUNTER_STATUS.SUCCESS })
        return dbResponse
    } catch (error) {
        throw new InternalChronosError(StatusCodes.INTERNAL_SERVER_ERROR, `Error: skillsService.createSkill - ${getErrorMessage(error)}`)
    }
}

/**
 * Delete a skill by ID
 * @param skillId - Skill UUID
 */
const deleteSkill = async (skillId: string): Promise<any> => {
    try {
        const appServer = getRunningExpressApp()
        const dbResponse = await appServer.AppDataSource.getRepository(Skill).delete({
            id: skillId
        })
        return dbResponse
    } catch (error) {
        throw new InternalChronosError(StatusCodes.INTERNAL_SERVER_ERROR, `Error: skillsService.deleteSkill - ${getErrorMessage(error)}`)
    }
}

/**
 * Get all skills with optional pagination
 * @param page - Page number (1-based), -1 for no pagination
 * @param limit - Items per page, -1 for no pagination
 */
const getAllSkills = async (page: number = -1, limit: number = -1) => {
    try {
        const appServer = getRunningExpressApp()
        const queryBuilder = appServer.AppDataSource.getRepository(Skill).createQueryBuilder('skill').orderBy('skill.updatedDate', 'DESC')

        if (page > 0 && limit > 0) {
            queryBuilder.skip((page - 1) * limit)
            queryBuilder.take(limit)
        }
        const [data, total] = await queryBuilder.getManyAndCount()

        if (page > 0 && limit > 0) {
            return { data, total }
        } else {
            return data
        }
    } catch (error) {
        throw new InternalChronosError(StatusCodes.INTERNAL_SERVER_ERROR, `Error: skillsService.getAllSkills - ${getErrorMessage(error)}`)
    }
}

/**
 * Get a single skill by ID
 * @param skillId - Skill UUID
 */
const getSkillById = async (skillId: string): Promise<any> => {
    try {
        const appServer = getRunningExpressApp()
        const dbResponse = await appServer.AppDataSource.getRepository(Skill).findOneBy({
            id: skillId
        })
        if (!dbResponse) {
            throw new InternalChronosError(StatusCodes.NOT_FOUND, `Skill ${skillId} not found`)
        }
        return dbResponse
    } catch (error) {
        throw new InternalChronosError(StatusCodes.INTERNAL_SERVER_ERROR, `Error: skillsService.getSkillById - ${getErrorMessage(error)}`)
    }
}

/**
 * Update an existing skill
 * @param skillId - Skill UUID
 * @param skillBody - Updated skill data
 */
const updateSkill = async (skillId: string, skillBody: any): Promise<any> => {
    try {
        const appServer = getRunningExpressApp()
        const skill = await appServer.AppDataSource.getRepository(Skill).findOneBy({
            id: skillId
        })
        if (!skill) {
            throw new InternalChronosError(StatusCodes.NOT_FOUND, `Skill ${skillId} not found`)
        }
        const updatedSkill = new Skill()
        Object.assign(updatedSkill, skillBody)
        appServer.AppDataSource.getRepository(Skill).merge(skill, updatedSkill)
        const dbResponse = await appServer.AppDataSource.getRepository(Skill).save(skill)
        return dbResponse
    } catch (error) {
        throw new InternalChronosError(StatusCodes.INTERNAL_SERVER_ERROR, `Error: skillsService.updateSkill - ${getErrorMessage(error)}`)
    }
}

/**
 * Import skills in bulk with duplicate ID handling
 * @param newSkills - Array of partial skill objects
 * @param queryRunner - Optional TypeORM query runner for transactions
 */
const importSkills = async (newSkills: Partial<Skill>[], queryRunner?: QueryRunner) => {
    try {
        for (const data of newSkills) {
            if (data.id && !validate(data.id)) {
                throw new InternalChronosError(StatusCodes.PRECONDITION_FAILED, `Error: importSkills - invalid id!`)
            }
        }

        const appServer = getRunningExpressApp()
        const repository = queryRunner ? queryRunner.manager.getRepository(Skill) : appServer.AppDataSource.getRepository(Skill)

        // step 1 - check whether file skills array is zero
        if (newSkills.length == 0) return

        // step 2 - check whether ids are duplicate in database
        let ids = '('
        let count: number = 0
        const lastCount = newSkills.length - 1
        newSkills.forEach((newSkill) => {
            ids += `'${newSkill.id}'`
            if (lastCount != count) ids += ','
            if (lastCount == count) ids += ')'
            count += 1
        })

        const selectResponse = await repository.createQueryBuilder('s').select('s.id').where(`s.id IN ${ids}`).getMany()
        const foundIds = selectResponse.map((response) => {
            return response.id
        })

        // step 3 - remove ids that are only duplicate
        const prepSkills: Partial<Skill>[] = newSkills.map((newSkill) => {
            let id: string = ''
            if (newSkill.id) id = newSkill.id
            if (foundIds.includes(id)) {
                newSkill.id = undefined
                newSkill.name += ' (1)'
            }
            return newSkill
        })

        // step 4 - transactional insert array of entities
        const insertResponse = await repository.insert(prepSkills)

        return insertResponse
    } catch (error) {
        throw new InternalChronosError(StatusCodes.INTERNAL_SERVER_ERROR, `Error: skillsService.importSkills - ${getErrorMessage(error)}`)
    }
}

export default {
    createSkill,
    deleteSkill,
    getAllSkills,
    getSkillById,
    updateSkill,
    importSkills
}
