export default async function PrivacyPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  const ru = locale === 'ru'

  return (
    <div className="max-w-3xl mx-auto px-6 py-12">
      <h1 className="text-2xl font-semibold">
        {ru ? 'Политика конфиденциальности' : 'Privacy Policy'}
      </h1>
      <p className="text-sm text-gray-500 mt-1">
        {ru
          ? 'Последнее обновление: июнь 2026'
          : 'Last updated: June 2026'}
      </p>

      {ru ? (
        <>
          <p className="text-sm text-gray-600 mt-4 leading-relaxed">
            Настоящая Политика конфиденциальности описывает, как{' '}
            <strong>[COMPANY]</strong> («мы», «нас», «наш») собирает, использует
            и защищает персональные данные пользователей сервиса Contento
            («Сервис»). Используя Сервис, вы соглашаетесь с условиями данной
            Политики.
          </p>

          <h2 className="text-lg font-medium mt-8">1. Какие данные мы собираем</h2>
          <p className="text-sm text-gray-600 mt-2 leading-relaxed">
            <strong>Данные аккаунта:</strong> при регистрации мы собираем ваш
            адрес электронной почты и пароль.
          </p>
          <p className="text-sm text-gray-600 mt-2 leading-relaxed">
            <strong>Данные Instagram Direct (ассистент продаж):</strong> если
            вы подключаете функцию «Ассистент продаж в Instagram», мы получаем
            через Instagram Graph API входящие сообщения в Instagram Direct,
            имя и имя пользователя (username) отправителя, а также номера
            телефонов, которые пользователи добровольно указывают в переписке.
          </p>
          <p className="text-sm text-gray-600 mt-2 leading-relaxed">
            <strong>Контент, создаваемый в Сервисе:</strong> тексты сценариев,
            идеи публикаций и прочие материалы, которые вы создаёте или
            загружаете в Contento.
          </p>

          <h2 className="text-lg font-medium mt-8">2. Как мы используем данные</h2>
          <p className="text-sm text-gray-600 mt-2 leading-relaxed">
            Собранные данные используются для:
          </p>
          <ul className="list-disc list-inside text-sm text-gray-600 mt-2 leading-relaxed space-y-1">
            <li>автоматического ответа на входящие запросы клиентов через Instagram Direct;</li>
            <li>сопровождения сделок и follow-up в рамках воронки продаж;</li>
            <li>генерации маркетингового контента (сценарии, публикации, видео);</li>
            <li>улучшения качества Сервиса и обеспечения его работы.</li>
          </ul>

          <h2 className="text-lg font-medium mt-8">3. Хранение данных</h2>
          <p className="text-sm text-gray-600 mt-2 leading-relaxed">
            Все данные хранятся на собственных серверах{' '}
            <strong>[COMPANY]</strong> (PostgreSQL). Мы применяем стандартные
            технические и организационные меры для защиты данных от
            несанкционированного доступа.
          </p>

          <h2 className="text-lg font-medium mt-8">
            4. Передача данных третьим лицам
          </h2>
          <p className="text-sm text-gray-600 mt-2 leading-relaxed">
            Для работы Сервиса мы привлекаем следующих субобработчиков:
          </p>
          <ul className="list-disc list-inside text-sm text-gray-600 mt-2 leading-relaxed space-y-1">
            <li>
              <strong>Anthropic (Claude AI)</strong> — генерация ответов и контента
              с помощью ИИ;
            </li>
            <li>
              <strong>Meta / Instagram Graph API</strong> — получение и отправка
              сообщений в Instagram Direct;
            </li>
            <li>
              <strong>Telegram</strong> — пересылка лидов команде продаж;
            </li>
            <li>
              <strong>ElevenLabs</strong> — синтез голоса для видео;
            </li>
            <li>
              <strong>Higgsfield</strong> — генерация видеоматериалов.
            </li>
          </ul>
          <p className="text-sm text-gray-600 mt-2 leading-relaxed">
            Мы не продаём ваши данные третьим лицам.
          </p>

          <h2 className="text-lg font-medium mt-8">5. Сроки хранения и права</h2>
          <p className="text-sm text-gray-600 mt-2 leading-relaxed">
            Данные хранятся до момента удаления вашего аккаунта или получения
            запроса на удаление. Вы вправе запросить доступ, исправление или
            удаление своих данных, обратившись по адресу{' '}
            <strong>[CONTACT_EMAIL]</strong>.
          </p>
          <p className="text-sm text-gray-600 mt-2 leading-relaxed">
            Инструкции по удалению данных о конечных пользователях (клиентах
            вашего бизнеса) см. на странице{' '}
            <a
              href={`/${locale}/data-deletion`}
              className="underline text-gray-800"
            >
              Удаление данных
            </a>
            .
          </p>

          <h2 className="text-lg font-medium mt-8">6. Контакты</h2>
          <p className="text-sm text-gray-600 mt-2 leading-relaxed">
            По вопросам конфиденциальности обращайтесь:{' '}
            <strong>[CONTACT_EMAIL]</strong>
          </p>
        </>
      ) : (
        <>
          <p className="text-sm text-gray-600 mt-4 leading-relaxed">
            This Privacy Policy describes how <strong>[COMPANY]</strong> (&#8220;we&#8221;,
            &#8220;us&#8221;, &#8220;our&#8221;) collects, uses, and protects the personal data of users
            of the Contento service (&#8220;Service&#8221;). By using the Service you agree
            to this Policy.
          </p>

          <h2 className="text-lg font-medium mt-8">1. Data We Collect</h2>
          <p className="text-sm text-gray-600 mt-2 leading-relaxed">
            <strong>Account data:</strong> when you register we collect your
            email address and password.
          </p>
          <p className="text-sm text-gray-600 mt-2 leading-relaxed">
            <strong>Instagram Direct data (sales assistant feature):</strong> if
            you connect the Instagram Sales Assistant, we receive via the
            Instagram Graph API inbound Instagram Direct messages, the
            sender&apos;s name and username, and phone numbers that users
            voluntarily share in the conversation.
          </p>
          <p className="text-sm text-gray-600 mt-2 leading-relaxed">
            <strong>Content you create:</strong> scripts, post ideas, and other
            materials you create or upload inside Contento.
          </p>

          <h2 className="text-lg font-medium mt-8">2. How We Use Data</h2>
          <p className="text-sm text-gray-600 mt-2 leading-relaxed">
            We use collected data to:
          </p>
          <ul className="list-disc list-inside text-sm text-gray-600 mt-2 leading-relaxed space-y-1">
            <li>automatically reply to inbound customer inquiries via Instagram Direct;</li>
            <li>manage leads and perform sales follow-up;</li>
            <li>generate marketing content (scripts, posts, videos);</li>
            <li>operate and improve the Service.</li>
          </ul>

          <h2 className="text-lg font-medium mt-8">3. Data Storage</h2>
          <p className="text-sm text-gray-600 mt-2 leading-relaxed">
            All data is stored on <strong>[COMPANY]</strong>&apos;s own servers
            (PostgreSQL). We apply standard technical and organisational measures
            to protect data from unauthorised access.
          </p>

          <h2 className="text-lg font-medium mt-8">4. Third-Party Processors</h2>
          <p className="text-sm text-gray-600 mt-2 leading-relaxed">
            We engage the following sub-processors to operate the Service:
          </p>
          <ul className="list-disc list-inside text-sm text-gray-600 mt-2 leading-relaxed space-y-1">
            <li>
              <strong>Anthropic (Claude AI)</strong> — AI-powered reply and
              content generation;
            </li>
            <li>
              <strong>Meta / Instagram Graph API</strong> — receiving and sending
              Instagram Direct messages;
            </li>
            <li>
              <strong>Telegram</strong> — forwarding leads to the sales team;
            </li>
            <li>
              <strong>ElevenLabs</strong> — voice synthesis for video;
            </li>
            <li>
              <strong>Higgsfield</strong> — video generation.
            </li>
          </ul>
          <p className="text-sm text-gray-600 mt-2 leading-relaxed">
            We do not sell your data to third parties.
          </p>

          <h2 className="text-lg font-medium mt-8">5. Retention & Your Rights</h2>
          <p className="text-sm text-gray-600 mt-2 leading-relaxed">
            Data is retained until you delete your account or submit a deletion
            request. You have the right to access, correct, or delete your data
            by contacting <strong>[CONTACT_EMAIL]</strong>.
          </p>
          <p className="text-sm text-gray-600 mt-2 leading-relaxed">
            For instructions on deleting data about end-users (your business
            contacts), see the{' '}
            <a
              href={`/${locale}/data-deletion`}
              className="underline text-gray-800"
            >
              Data Deletion
            </a>{' '}
            page.
          </p>

          <h2 className="text-lg font-medium mt-8">6. Contact</h2>
          <p className="text-sm text-gray-600 mt-2 leading-relaxed">
            For privacy questions contact us at{' '}
            <strong>[CONTACT_EMAIL]</strong>.
          </p>
        </>
      )}

      <p className="text-xs text-gray-400 mt-12 italic">
        {ru
          ? 'Этот документ является шаблоном и должен быть проверен владельцем бизнеса и/или юристом перед публикацией.'
          : 'This document is a template and must be reviewed by the business owner and/or legal counsel before publication.'}
      </p>
    </div>
  )
}
