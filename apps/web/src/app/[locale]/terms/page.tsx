export default async function TermsPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  const ru = locale === 'ru'

  return (
    <div className="max-w-3xl mx-auto px-6 py-12">
      <h1 className="text-2xl font-semibold">
        {ru ? 'Условия использования' : 'Terms of Service'}
      </h1>
      <p className="text-sm text-gray-500 mt-1">
        {ru
          ? 'Последнее обновление: июнь 2026'
          : 'Last updated: June 2026'}
      </p>

      {ru ? (
        <>
          <p className="text-sm text-gray-600 mt-4 leading-relaxed">
            Настоящие Условия использования («Условия») регулируют доступ и
            использование сервиса Contento, предоставляемого{' '}
            <strong>[COMPANY]</strong> («мы»). Используя Сервис, вы принимаете
            настоящие Условия в полном объёме.
          </p>

          <h2 className="text-lg font-medium mt-8">1. Допустимое использование</h2>
          <p className="text-sm text-gray-600 mt-2 leading-relaxed">
            Вы обязуетесь использовать Сервис исключительно в законных целях и
            в соответствии с настоящими Условиями. Запрещается:
          </p>
          <ul className="list-disc list-inside text-sm text-gray-600 mt-2 leading-relaxed space-y-1">
            <li>использовать Сервис для распространения незаконного или вредоносного контента;</li>
            <li>нарушать права третьих лиц, в том числе права на конфиденциальность;</li>
            <li>осуществлять несанкционированный доступ к системам или данным третьих лиц;</li>
            <li>передавать доступ к аккаунту третьим лицам без нашего согласия.</li>
          </ul>

          <h2 className="text-lg font-medium mt-8">2. Предоставление Сервиса</h2>
          <p className="text-sm text-gray-600 mt-2 leading-relaxed">
            Сервис предоставляется «как есть» и «по мере доступности» без каких-либо
            гарантий — явных или подразумеваемых, включая гарантии пригодности для
            конкретной цели, бесперебойной работы или отсутствия ошибок. Мы
            оставляем за собой право в любое время изменять, приостанавливать или
            прекращать работу Сервиса.
          </p>

          <h2 className="text-lg font-medium mt-8">
            3. Ограничение ответственности
          </h2>
          <p className="text-sm text-gray-600 mt-2 leading-relaxed">
            В максимальной степени, допускаемой применимым законодательством,{' '}
            <strong>[COMPANY]</strong> не несёт ответственности за косвенные,
            случайные, специальные или штрафные убытки, связанные с использованием
            или невозможностью использования Сервиса, даже если мы были уведомлены
            о возможности таких убытков. Совокупная ответственность{' '}
            <strong>[COMPANY]</strong> перед вами не превышает суммы, уплаченной
            вами за Сервис за последние 12 месяцев.
          </p>

          <h2 className="text-lg font-medium mt-8">4. Интеллектуальная собственность</h2>
          <p className="text-sm text-gray-600 mt-2 leading-relaxed">
            Все права на Сервис, включая программный код, дизайн и торговые марки,
            принадлежат <strong>[COMPANY]</strong>. Контент, созданный вами с
            помощью Сервиса, остаётся вашей собственностью. Вы предоставляете нам
            ограниченную лицензию на обработку этого контента исключительно для
            оказания услуг Сервиса.
          </p>

          <h2 className="text-lg font-medium mt-8">5. Изменение Условий</h2>
          <p className="text-sm text-gray-600 mt-2 leading-relaxed">
            Мы вправе изменять настоящие Условия в любое время. Об изменениях мы
            уведомим вас по электронной почте или через интерфейс Сервиса не менее
            чем за 14 дней до вступления изменений в силу. Продолжение использования
            Сервиса после вступления изменений в силу означает ваше согласие с ними.
          </p>

          <h2 className="text-lg font-medium mt-8">6. Применимое право</h2>
          <p className="text-sm text-gray-600 mt-2 leading-relaxed">
            Настоящие Условия регулируются законодательством{' '}
            <strong>[JURISDICTION]</strong>. Все споры подлежат разрешению в
            судах соответствующей юрисдикции.
          </p>

          <h2 className="text-lg font-medium mt-8">7. Контакты</h2>
          <p className="text-sm text-gray-600 mt-2 leading-relaxed">
            По вопросам, связанным с настоящими Условиями, обращайтесь:{' '}
            <strong>[CONTACT_EMAIL]</strong>
          </p>
        </>
      ) : (
        <>
          <p className="text-sm text-gray-600 mt-4 leading-relaxed">
            These Terms of Service (&#8220;Terms&#8221;) govern your access to and use of the
            Contento service provided by <strong>[COMPANY]</strong> (&#8220;we&#8221;, &#8220;us&#8221;).
            By using the Service you accept these Terms in full.
          </p>

          <h2 className="text-lg font-medium mt-8">1. Acceptable Use</h2>
          <p className="text-sm text-gray-600 mt-2 leading-relaxed">
            You agree to use the Service only for lawful purposes and in
            accordance with these Terms. You must not:
          </p>
          <ul className="list-disc list-inside text-sm text-gray-600 mt-2 leading-relaxed space-y-1">
            <li>use the Service to distribute illegal or harmful content;</li>
            <li>violate the rights of third parties, including privacy rights;</li>
            <li>attempt to gain unauthorised access to any systems or data;</li>
            <li>share account access with third parties without our consent.</li>
          </ul>

          <h2 className="text-lg font-medium mt-8">2. Service Provision</h2>
          <p className="text-sm text-gray-600 mt-2 leading-relaxed">
            The Service is provided &#8220;as is&#8221; and &#8220;as available&#8221; without warranties
            of any kind — express or implied — including warranties of
            merchantability, fitness for a particular purpose, or uninterrupted
            error-free operation. We reserve the right to modify, suspend, or
            discontinue the Service at any time.
          </p>

          <h2 className="text-lg font-medium mt-8">3. Limitation of Liability</h2>
          <p className="text-sm text-gray-600 mt-2 leading-relaxed">
            To the maximum extent permitted by applicable law,{' '}
            <strong>[COMPANY]</strong> shall not be liable for indirect,
            incidental, special, or consequential damages arising from your use
            of or inability to use the Service, even if we have been advised of
            the possibility of such damages. Our total aggregate liability to you
            shall not exceed the amounts you paid for the Service in the 12 months
            preceding the claim.
          </p>

          <h2 className="text-lg font-medium mt-8">4. Intellectual Property</h2>
          <p className="text-sm text-gray-600 mt-2 leading-relaxed">
            All rights in the Service — including code, design, and trademarks —
            belong to <strong>[COMPANY]</strong>. Content you create using the
            Service remains your property. You grant us a limited licence to
            process that content solely to provide the Service.
          </p>

          <h2 className="text-lg font-medium mt-8">5. Changes to Terms</h2>
          <p className="text-sm text-gray-600 mt-2 leading-relaxed">
            We may update these Terms at any time. We will notify you by email or
            within the Service interface at least 14 days before changes take
            effect. Continued use of the Service after changes take effect
            constitutes your acceptance of the updated Terms.
          </p>

          <h2 className="text-lg font-medium mt-8">6. Governing Law</h2>
          <p className="text-sm text-gray-600 mt-2 leading-relaxed">
            These Terms are governed by the laws of{' '}
            <strong>[JURISDICTION]</strong>. All disputes shall be resolved in
            the courts of the applicable jurisdiction.
          </p>

          <h2 className="text-lg font-medium mt-8">7. Contact</h2>
          <p className="text-sm text-gray-600 mt-2 leading-relaxed">
            For questions about these Terms contact us at{' '}
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
