import { QueryRunner } from 'typeorm'
import bcrypt from 'bcryptjs'
import * as DataSource from './DataSource'
import { User } from './database/entities/User'
import { createModuleLogger } from './utils/logger'

const logger = createModuleLogger('server')
import { bootstrap } from './utils/bootstrap'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'

/**
 * Validate password strength
 * @param password - Password to validate
 * @returns true if invalid, false if valid
 */
function isInvalidPassword(password: string): boolean {
    if (password.length < 8) return true
    return false
}

async function listUserEmails(queryRunner: QueryRunner) {
    logger.info('Listing all user emails')
    const users = await queryRunner.manager.find(User, {
        select: ['email']
    })

    const emails = users.map((user) => user.email)
    logger.info(`Email addresses: ${emails.join(', ')}`)
    logger.info(`Email count: ${emails.length}`)
    logger.info('To reset user password, run the following command: pnpm user --email "myEmail" --password "myPassword"')
}

async function resetPassword(queryRunner: QueryRunner, email: string, password: string) {
    logger.info(`Finding user by email: ${email}`)
    const user = await queryRunner.manager.findOne(User, {
        where: { email }
    })
    if (!user) throw new Error(`User not found with email: ${email}`)

    if (isInvalidPassword(password)) {
        throw new Error(`Invalid password: Must be at least 8 characters`)
    }

    user.password = await bcrypt.hash(password, 10)
    await queryRunner.manager.save(user)
    logger.info(`Password reset for user: ${email}`)
}

async function run() {
    // Parse arguments
    const argv = await yargs(hideBin(process.argv))
        .option('email', {
            type: 'string',
            description: 'Email address to search for in the user database'
        })
        .option('password', {
            type: 'string',
            description: 'New password for that user'
        })
        .help().argv

    bootstrap(async () => {
        // No special cleanup needed for user command script usually,
        // but keeps consistency.
    })

    let queryRunner: QueryRunner | undefined
    try {
        logger.info('Initializing DataSource')
        const dataSource = await DataSource.getDataSource()
        await dataSource.initialize()

        queryRunner = dataSource.createQueryRunner()
        await queryRunner.connect()

        if (argv.email && argv.password) {
            logger.info('Running resetPassword')
            await resetPassword(queryRunner, argv.email, argv.password)
        } else {
            logger.info('Running listUserEmails')
            await listUserEmails(queryRunner)
        }
    } catch (error) {
        logger.error(error)
        process.exit(1)
    } finally {
        if (queryRunner && !queryRunner.isReleased) await queryRunner.release()
        process.exit(0)
    }
}

run()
